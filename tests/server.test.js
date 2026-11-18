const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { gzipSync } = require('node:zlib');
const http = require('node:http');
const { io } = require('socket.io-client');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function boot(port, dir, pin = '123456') {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      BUNKER_DATA_DIR: dir,
      BUNKER_MODERATOR_PIN: pin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += chunk));
  child.stderr.on('data', (chunk) => (logs += chunk));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(url + '/api/info')).ok) return { child, url };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error('Server did not start: ' + logs);
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
async function connect(url, token, role = 'moderator') {
  const socket = io(url, {
    autoConnect: false,
    auth: { token },
    query: { role },
    transports: ['websocket'],
    reconnection: false,
  });
  const initialized = once(socket, 'init');
  socket.connect();
  await initialized;
  return socket;
}
const command = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
test('real sockets authorize mutations, persist, restart and prevent reset when archive fails', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-server-')),
    port = await availablePort();
  let instance = await boot(port, dir);
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await stop(instance.child);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let response = await fetch(instance.url + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const token = (await response.json()).token;
  assert.ok(token);
  const moderator = await connect(instance.url, token);
  sockets.push(moderator);
  const tv = await connect(instance.url, '', 'tv');
  sockets.push(tv);
  assert.equal((await command(tv, 'game:reset', { playerCount: 4 })).success, false);
  const newCard = {
    title: 'Restaurator de hărți',
    description: 'Poate reface hărți vechi.',
    category: 'profesie',
    playerId: 1,
    showOnTv: false,
  };
  assert.equal((await command(tv, 'catalog:create', newCard)).success, false);
  assert.equal(
    (await command(moderator, 'catalog:create', { ...newCard, playerId: 999 })).success,
    false,
  );
  const added = once(moderator, 'catalog:card_added');
  assert.equal((await command(moderator, 'catalog:create', newCard)).success, true);
  const [customCard] = await added;
  assert.equal(customCard.title, newCard.title);
  assert.equal(
    (await command(moderator, 'catalog:create', { ...newCard, title: 'RESTAURATOR DE HARTI' }))
      .success,
    false,
  );
  assert.equal(
    (await command(moderator, 'player:rename', { playerId: 1, name: 'Persisted' })).success,
    true,
  );
  assert.equal((await command(moderator, 'votes:record', {})).success, false);
  assert.equal(
    (await command(moderator, 'schedule:update', { exileSchedule: [100, 0, 0, 0, 0] })).success,
    false,
  );
  assert.equal(
    (await command(moderator, 'game:set_phase', { round: 2, phase: 'discussion' })).success,
    true,
  );
  assert.equal((await command(moderator, 'votes:start')).success, true);
  await Promise.all([
    command(moderator, 'votes:adjust', { playerId: 1, delta: 1 }),
    command(moderator, 'votes:adjust', { playerId: 1, delta: 1 }),
  ]);
  let state = await (
    await fetch(instance.url + '/api/state', { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  assert.equal(state.players[0].votes, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'gamestate.json'), 'utf8')).players[0].name,
    'Persisted',
  );
  moderator.disconnect();
  tv.disconnect();
  await stop(instance.child);
  instance = await boot(port, dir);
  response = await fetch(instance.url + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const nextToken = (await response.json()).token;
  state = await (
    await fetch(instance.url + '/api/state', { headers: { Authorization: `Bearer ${nextToken}` } })
  ).json();
  assert.equal(state.players[0].name, 'Persisted');
  assert.equal(state.players[0].votes, 2);
  assert.deepEqual(state.players[0].cards.profesie, customCard);
  const restartedCatalog = await (await fetch(instance.url + '/api/cards')).json();
  assert.equal(restartedCatalog.cards.filter((card) => card.title === newCard.title).length, 1);
  // Make the history index unusable; reset must not discard the active game.
  fs.mkdirSync(path.join(dir, 'games_history.json'));
  const reset = await fetch(instance.url + '/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nextToken}` },
    body: JSON.stringify({ playerCount: 4 }),
  });
  assert.equal(reset.status, 400);
  state = await (await fetch(instance.url + '/api/state')).json();
  assert.equal(state.playerCount, 10);
  assert.equal(state.players[0].name, 'Persisted');
  fs.rmdirSync(path.join(dir, 'games_history.json'));
  const active = await connect(instance.url, nextToken);
  sockets.push(active);
  for (let i = 0; i < 2; i++)
    assert.equal((await command(active, 'game:reset_and_save', { playerCount: 8 })).success, true);
  assert.equal(
    (
      await command(active, 'player:reveal_card', {
        gameId: state.gameId,
        playerId: 1,
        category: 'profesie',
        cardId: customCard.id,
      })
    ).success,
    false,
  );
  const history = JSON.parse(fs.readFileSync(path.join(dir, 'games_history.json'), 'utf8'));
  assert.equal(history.length, 2);
  assert.notEqual(history[0].id, history[1].id);
  assert.equal(
    (
      await command(active, 'player:reveal_card', {
        playerId: 1,
        category: 'profesie',
        cardId: customCard.id,
        showOnTv: false,
      })
    ).success,
    true,
  );
});

test(
  'remote moderator access requires a PIN by default and host can revoke other sessions',
  { timeout: 15000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-sessions-'));
    const port = await availablePort();
    const { child, url } = await boot(port, dir, '');
    let client;
    t.after(async () => {
      client?.disconnect();
      await stop(child);
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const signIn = () =>
      fetch(url + '/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    const remoteStatus = await new Promise((resolve, reject) => {
      const request = http.request(
        url + '/api/session',
        {
          method: 'POST',
          headers: { Host: 'bunker.local', 'Content-Type': 'application/json' },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end('{}');
    });
    assert.equal(remoteStatus, 401);
    const compressed = await fetch(url + '/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync('{}'),
    });
    assert.equal(compressed.status, 415);
    const { token: host } = await (await signIn()).json();
    const { token: other } = await (await signIn()).json();
    assert.ok(host && other);
    assert.notEqual(host, other);
    client = await connect(url, other);
    const revoked = once(client, 'session:expired');
    const response = await fetch(url + '/api/sessions/others', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${host}` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).count, 1);
    await revoked;
    assert.equal(
      (await fetch(url + '/api/history', { headers: { Authorization: `Bearer ${other}` } })).status,
      401,
    );
    assert.equal(
      (await fetch(url + '/api/history', { headers: { Authorization: `Bearer ${host}` } })).status,
      200,
    );
  },
);
