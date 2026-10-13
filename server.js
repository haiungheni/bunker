const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { createState, migrate, applyCommand, publicState, updateTimer } = require('./lib/game');
const { writeJson, readJson } = require('./lib/storage');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.BUNKER_DATA_DIR || path.join(__dirname, 'data'));
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const HISTORY_INDEX_FILE = path.join(DATA_DIR, 'games_history.json');
const STATE_FILE = path.join(DATA_DIR, 'gamestate.json');
const CARDS_FILE = path.join(__dirname, 'data', 'cards.json');
const CARDS_RO_DIR = path.join(__dirname, 'Jocul_Bunker', 'Bunker_ro');
const moderatorPin = process.env.BUNKER_MODERATOR_PIN || '';
const moderatorToken = crypto.randomBytes(32).toString('hex');
const app = express();
const server = http.createServer(app);
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
const io = new Server(server, {
  maxHttpBufferSize: 65536,
  allowRequest: (request, callback) => callback(null, sameOrigin(request)),
});
fs.mkdirSync(HISTORY_DIR, { recursive: true });
const cardsDatabase = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
let gameState;
try {
  const restored = readJson(STATE_FILE, migrate);
  gameState = restored.value || createState(cardsDatabase);
  if (restored.recovered) console.warn('[RECUPERARE] Partida a fost restaurată din copia .bak.');
} catch (error) {
  // Retain both failed recovery sources; never replace an unreadable saved game silently.
  throw new Error(`Partida salvată nu poate fi restaurată: ${error.message}`);
}
let undoStack = [];
let tvCount = 0;
let saveError = false;
function getLocalIps() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((x) => x && x.family === 'IPv4' && !x.internal)
    .map((x) => x.address);
}
function authorized(token) {
  if (typeof token !== 'string') return false;
  const supplied = Buffer.from(token),
    expected = Buffer.from(moderatorToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
function saveState() {
  try {
    writeJson(STATE_FILE, gameState);
    saveError = false;
    return true;
  } catch (error) {
    saveError = true;
    console.error('[SALVARE]', error.message);
    io.to('moderators').emit('toast:error', {
      message:
        'Salvarea pe disc a eșuat. Partida rămâne în memorie; verifică spațiul și permisiunile.',
    });
    return false;
  }
}
function stateFor(moderator = false) {
  updateTimer(gameState);
  const state = moderator ? structuredClone(gameState) : publicState(gameState);
  state.canUndo = moderator && undoStack.length > 0;
  state.saveError = saveError;
  return state;
}
function presence() {
  io.emit('presence', { tvCount });
}
function broadcastState() {
  io.to('moderators').emit('game:state', stateFor(true));
  io.to('viewers').emit('game:state', stateFor(false));
}
function commit(next, previous, effects = []) {
  if (previous) {
    undoStack.push(structuredClone(previous));
    if (undoStack.length > 30) undoStack.shift();
  }
  gameState = next;
  saveState();
  broadcastState();
  for (const [event, data] of effects) io.emit(event, data);
}

function archiveCurrentGame(state) {
  if (!state) return null;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestampStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const gameId = `game_${timestampStr}_${crypto.randomUUID().slice(0, 8)}`;
  const filename = `${gameId}.json`;
  const filePath = path.join(HISTORY_DIR, filename);

  const alivePlayers = (state.players || []).filter((p) => p.status === 'alive');
  const exiledPlayers = (state.players || []).filter((p) => p.status === 'exiled');

  const historyRecord = {
    id: gameId,
    savedAt: now.toISOString(),
    formattedDate: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    mode: state.mode || 'basic',
    goal: state.goal || 'renastere',
    roundReached: state.round,
    totalRounds: state.totalRounds || 5,
    phase: state.phase,
    playerCount: state.playerCount,
    bunkerCapacity: state.bunkerCapacity,
    expectedExiles: state.expectedExiles,
    exileSchedule: state.exileSchedule,
    catastrophe: state.catastrophe
      ? {
          id: state.catastrophe.id,
          title: state.catastrophe.title,
          description: state.catastrophe.description,
          image: state.catastrophe.image,
        }
      : null,
    bunkerCards: (state.bunkerCards || []).map((b) => ({
      round: b.roundNumber,
      title: b.title,
      revealed: b.revealed,
      description: b.description,
    })),
    threatsRevealed: (state.revealedThreats || []).map((t) => ({
      id: t.id,
      title: t.title,
    })),
    survivors: alivePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      cards: Object.entries(p.cards || {}).reduce((acc, [cat, c]) => {
        if (c) acc[cat] = c.title;
        return acc;
      }, {}),
    })),
    exiled: exiledPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      exiledInRound: p.exiledInRound,
      cards: Object.entries(p.cards || {}).reduce((acc, [cat, c]) => {
        if (c) acc[cat] = c.title;
        return acc;
      }, {}),
    })),
    fullPlayersData: state.players,
  };

  try {
    writeJson(filePath, historyRecord);

    let historyList = [];
    if (fs.existsSync(HISTORY_INDEX_FILE) || fs.existsSync(`${HISTORY_INDEX_FILE}.bak`)) {
      try {
        historyList =
          readJson(HISTORY_INDEX_FILE, (value) => {
            if (!Array.isArray(value)) throw new Error('Istoric invalid');
            return value;
          }).value || [];
        if (!Array.isArray(historyList)) historyList = [];
      } catch (e) {
        throw new Error('Istoricul existent nu poate fi citit; resetarea a fost oprită.');
      }
    }

    historyList.unshift({
      id: gameId,
      filename: filename,
      savedAt: historyRecord.savedAt,
      formattedDate: historyRecord.formattedDate,
      playerCount: historyRecord.playerCount,
      survivorsCount: alivePlayers.length,
      exiledCount: exiledPlayers.length,
      bunkerCapacity: historyRecord.bunkerCapacity,
      catastropheTitle: historyRecord.catastrophe ? historyRecord.catastrophe.title : 'Necunoscut',
      goal: historyRecord.goal,
    });

    writeJson(HISTORY_INDEX_FILE, historyList);
    console.log(`[HISTORY] Arhivat joc în ${filePath}`);
    return { filename, id: gameId };
  } catch (err) {
    console.error('[HISTORY ERROR] Nu s-a putut salva istoricul:', err);
    return null;
  }
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origine nepermisă.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
const loginAttempts = new Map();
app.post('/api/session', (req, res) => {
  const address = req.socket.remoteAddress;
  const local =
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname);
  const now = Date.now();
  const attempts = loginAttempts.get(address) || { count: 0, resetAt: now + 60000 };
  if (now > attempts.resetAt) {
    attempts.count = 0;
    attempts.resetAt = now + 60000;
  }
  if (attempts.count >= 10)
    return res.status(429).json({ error: 'Prea multe încercări. Reîncearcă peste un minut.' });
  if (moderatorPin && !local && req.body?.pin !== moderatorPin) {
    attempts.count++;
    loginAttempts.set(address, attempts);
    return res
      .status(401)
      .json({ error: 'PIN incorect. PIN-ul este afișat în terminalul serverului.' });
  }
  loginAttempts.delete(address);
  res.json({ token: moderatorToken });
});
const loginCleanup = setInterval(() => {
  for (const [key, value] of loginAttempts)
    if (value.resetAt < Date.now()) loginAttempts.delete(key);
}, 60000);
function requireModerator(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!authorized(token)) return res.status(401).json({ error: 'Acces de moderator necesar.' });
  next();
}
app.get('/api/cards', (req, res) => res.json(cardsDatabase));
app.get('/api/state', (req, res) =>
  res.json(stateFor(authorized(req.headers.authorization?.replace(/^Bearer /, '')))),
);
app.get('/api/info', (req, res) =>
  res.json({
    localIps: getLocalIps(),
    port: PORT,
    urls: {
      moderator: `http://localhost:${PORT}/`,
      tv: `http://localhost:${PORT}/tv`,
      rules: `http://localhost:${PORT}/rules`,
    },
  }),
);
app.get('/api/history', requireModerator, (req, res) => {
  try {
    res.json(
      readJson(HISTORY_INDEX_FILE, (value) => {
        if (!Array.isArray(value)) throw new Error('Istoric invalid.');
        return value;
      }).value || [],
    );
  } catch (error) {
    res.status(500).json({ error: 'Istoricul nu poate fi citit.' });
  }
});
app.get('/api/history/:filename', requireModerator, (req, res) => {
  const file = req.params.filename;
  if (!/^game_[\w-]+\.json$/.test(file)) return res.status(400).json({ error: 'Fișier invalid.' });
  const target = path.join(HISTORY_DIR, file);
  if (fs.existsSync(target)) res.sendFile(target);
  else res.status(404).json({ error: 'Partida nu a fost găsită.' });
});
function resetGame(count) {
  const next = createState(cardsDatabase, count ?? gameState.playerCount);
  const saved = archiveCurrentGame(gameState);
  if (!saved) throw new Error('Arhivarea a eșuat. Partida curentă nu a fost resetată.');
  // Persist the replacement first; failed writes must leave the active game intact.
  writeJson(STATE_FILE, next);
  gameState = next;
  undoStack = [];
  saveError = false;
  broadcastState();
  return saved;
}
app.post('/api/reset', requireModerator, (req, res) => {
  try {
    const saved = resetGame(req.body?.playerCount);
    res.json({ success: true, state: stateFor(true), savedArchive: saved });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.get('/api/card-image/:id', (req, res) => {
  const card = cardsDatabase.cards.find((c) => c.id === req.params.id);
  if (!card) return res.status(404).send('Card not found');
  res.sendFile(path.join(CARDS_RO_DIR, card.folder, card.filename));
});
app.get('/vendor/qrcode.js', (req, res) => res.sendFile(require.resolve('qrcode-generator')));
app.use('/cards', express.static(CARDS_RO_DIR));
app.use(express.static(path.join(__dirname, 'public')));
for (const [route, file] of [
  ['/', 'index.html'],
  ['/moderator', 'index.html'],
  ['/tv', 'tv.html'],
  ['/rules', 'rules.html'],
])
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
app.use((err, req, res, next) => {
  console.error('[HTTP]', err.message);
  res.status(err.status || 500).json({
    error: err.status === 400 ? 'Date JSON invalide.' : 'Cererea nu a putut fi procesată.',
  });
});

io.use((socket, next) => {
  socket.data.moderator =
    socket.handshake.query.role === 'moderator' && authorized(socket.handshake.auth?.token);
  if (socket.handshake.query.role === 'moderator' && !socket.data.moderator)
    return next(new Error('AUTH_REQUIRED'));
  next();
});
const commands = [
  'game:setup',
  'player:add',
  'player:remove',
  'player:rename',
  'schedule:update',
  'player:reveal_card',
  'player:unreveal_card',
  'player:toggle_exile',
  'speaker:set',
  'timer:control',
  'bunker:reveal',
  'bunker:replace',
  'catastrophe:select',
  'threat:draw',
  'game:set_phase',
  'votes:start',
  'votes:adjust',
  'votes:record',
  'votes:result',
  'votes:tiebreak',
  'votes:exile',
  'modal:close',
  'modal:show',
  'game:undo',
  'audio:trigger',
  'game:reset',
  'game:reset_and_save',
];
const audioCues = [
  'round_transition',
  'vote_open',
  'vote_result',
  'readmit',
  'speaker_start',
  'card_reveal',
  'bunker_reveal',
  'exile_stamp',
  'gong',
  'tick',
  'alarm',
  'catastrophe_alarm',
  'threat_alarm',
  'victory',
];
io.on('connection', (socket) => {
  const moderator = socket.data.moderator;
  socket.join(moderator ? 'moderators' : 'viewers');
  if (socket.handshake.query.role === 'tv') tvCount++;
  socket.emit('init', {
    state: stateFor(moderator),
    catalog: cardsDatabase,
    serverIps: getLocalIps(),
    port: PORT,
    serverTime: Date.now(),
  });
  presence();
  socket.on('get:state', () => socket.emit('game:state', stateFor(moderator)));
  let burst = 0,
    burstAt = Date.now();
  for (const event of commands)
    socket.on(event, (payload = {}, ack) => {
      if (typeof payload === 'function') {
        ack = payload;
        payload = {};
      }
      const reply = (result) => {
        if (typeof ack === 'function') ack(result);
        else if (!result.success) socket.emit('toast:error', { message: result.message });
      };
      try {
        if (!moderator) throw new Error('Ecranul TV are acces doar pentru vizualizare.');
        if (Date.now() - burstAt > 1000) {
          burst = 0;
          burstAt = Date.now();
        }
        if (++burst > 40) throw new Error('Prea multe comenzi. Așteaptă o secundă.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
          throw new Error('Comandă invalidă.');
        if (event === 'audio:trigger') {
          if (!audioCues.includes(payload.cue)) throw new Error('Efect sonor invalid.');
          io.emit('audio:play', { cue: payload.cue });
        } else if (event === 'game:undo') {
          if (!undoStack.length) throw new Error('Nu există acțiuni de anulat.');
          const previous = undoStack.pop();
          previous.revision = gameState.revision + 1;
          previous.lastUpdate = Date.now();
          updateTimer(previous);
          previous.timer.isRunning = false;
          previous.timer.endsAt = null;
          previous.cardModal = null;
          commit(previous, null);
        } else if (event === 'game:reset' || event === 'game:reset_and_save') {
          const saved = resetGame(payload.playerCount);
          socket.emit('game:reset_complete', {
            success: true,
            savedFile: saved.filename,
            playerCount: gameState.playerCount,
            message: 'Partida a fost arhivată. Noul joc este pregătit pentru configurare.',
          });
        } else {
          const result = applyCommand(gameState, event, payload, cardsDatabase);
          commit(result.state, gameState, result.effects);
        }
        reply({ success: true, revision: gameState.revision, saved: !saveError });
      } catch (error) {
        reply({ success: false, message: error.message, code: error.code || 'INVALID_COMMAND' });
      }
    });
  socket.on('disconnect', () => {
    if (socket.handshake.query.role === 'tv') tvCount = Math.max(0, tvCount - 1);
    presence();
  });
});
const ticker = setInterval(() => {
  if (!gameState.timer.isRunning) return;
  const previous = gameState.timer.timeLeft;
  updateTimer(gameState);
  if (gameState.timer.timeLeft !== previous)
    io.emit('timer:tick', {
      ...gameState.timer,
      activeSpeakerId: gameState.activeSpeakerId,
      serverTime: Date.now(),
    });
  if (gameState.timer.timeLeft === 0) {
    gameState.timer.isRunning = false;
    gameState.timer.endsAt = null;
    io.emit('timer:done', {
      type: gameState.timer.type,
      activeSpeakerId: gameState.activeSpeakerId,
    });
    saveState();
    broadcastState();
  }
}, 200);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(ticker);
  clearInterval(loginCleanup);
  saveState();
  io.close(() => process.exit(saveError ? 1 : 0));
  setTimeout(() => process.exit(saveError ? 1 : 0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', (error) => {
  console.error('[SERVER]', error.message);
  clearInterval(ticker);
  clearInterval(loginCleanup);
  process.exitCode = 1;
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`BUNKER • Moderator: http://localhost:${PORT}/ • TV: http://localhost:${PORT}/tv`);
  getLocalIps().forEach((ip) => console.log(`Rețea: http://${ip}:${PORT}/tv`));
  console.log(
    moderatorPin
      ? `PIN moderator pentru telefon / tabletă: ${moderatorPin}`
      : 'Acces moderator fără PIN.',
  );
  if (process.argv.includes('--open') && process.platform === 'win32') {
    require('node:child_process').execFile(
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', `http://localhost:${PORT}/`],
      { windowsHide: true },
      (error) => {
        if (error) console.warn('Deschide consola manual în browser:', error.message);
      },
    );
  }
});
