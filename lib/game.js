const Rules = require('../public/js/game-rules');
const { randomUUID } = require('node:crypto');
const clone = (value) => structuredClone(value);
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label}: valoare între ${min} și ${max}.`);
  return value;
}
function name(value, fallback) {
  if ((value === undefined || value === '') && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length > 60 || !value.trim())
    throw new Error('Numele trebuie să conțină între 1 și 60 de caractere.');
  return value.trim();
}
const emptyCards = () => Object.fromEntries(Rules.categories.map((c) => [c, null]));
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function createState(catalog, count = 10) {
  integer(count, 4, 22, 'Jucători');
  const schedule = Rules.schedule(count);
  return {
    schemaVersion: 2,
    gameId: randomUUID(),
    revision: 0,
    gameStatus: 'setup',
    mode: 'basic',
    goal: count >= 8 ? 'renastere' : 'salvare',
    round: 1,
    totalRounds: 5,
    phase: 'bunker_reveal',
    playerCount: count,
    nextPlayerId: count + 1,
    bunkerCapacity: count - schedule.reduce((a, b) => a + b, 0),
    expectedExiles: schedule.reduce((a, b) => a + b, 0),
    exileSchedule: schedule,
    votingSchedule: [...schedule],
    customSchedule: false,
    catastrophe: shuffle(catalog.cards.filter((c) => c.category === 'catastrofe'))[0] || null,
    bunkerCards: shuffle(catalog.cards.filter((c) => c.category === 'bunker'))
      .slice(0, 5)
      .map((c, i) => ({ ...c, roundNumber: i + 1, revealed: false })),
    players: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      seat: i + 1,
      name: `Jucător ${i + 1}`,
      status: 'alive',
      exiledInRound: null,
      votes: 0,
      cards: emptyCards(),
    })),
    activeSpeakerId: null,
    lastSpeakerId: null,
    timer: { duration: 30, timeLeft: 30, isRunning: false, type: 'speech', endsAt: null },
    cardModal: null,
    votesRegistry: {},
    voteSession: { stage: 'idle', candidates: [] },
    revealedThreats: [],
    lastUpdate: Date.now(),
  };
}
function migrate(raw) {
  if (
    !raw ||
    !Array.isArray(raw.players) ||
    !raw.timer ||
    !Array.isArray(raw.bunkerCards) ||
    !Array.isArray(raw.revealedThreats)
  )
    throw new Error('Stare salvată invalidă.');
  integer(raw.players.length, 4, 22, 'Jucători');
  integer(raw.round, 1, 5, 'Rundă');
  if (
    !Rules.phases.includes(raw.phase) ||
    !['setup', 'playing', 'finale', 'ended'].includes(raw.gameStatus) ||
    !['basic', 'survival'].includes(raw.mode) ||
    !['salvare', 'renastere'].includes(raw.goal)
  )
    throw new Error('Configurație salvată invalidă.');
  if (new Set(raw.players.map((p) => p.id)).size !== raw.players.length)
    throw new Error('ID-uri duplicate.');
  const validCard = (c) =>
    c &&
    typeof c === 'object' &&
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.image === 'string';
  if (
    raw.bunkerCards.length !== 5 ||
    raw.bunkerCards.some((c) => !validCard(c) || typeof c.revealed !== 'boolean') ||
    raw.revealedThreats.some((c) => !validCard(c)) ||
    (raw.catastrophe !== null && !validCard(raw.catastrophe))
  )
    throw new Error('Catalogul partidei salvate este invalid.');
  if (
    raw.cardModal != null &&
    (!validCard(raw.cardModal.card) || !Number.isFinite(raw.cardModal.timestamp))
  )
    throw new Error('Dezvăluirea salvată este invalidă.');
  raw.players.forEach((p, i) => {
    integer(p.id, 1, Number.MAX_SAFE_INTEGER, 'ID');
    if (!['alive', 'exiled'].includes(p.status) || !p.cards || typeof p.cards !== 'object')
      throw new Error('Jucător invalid.');
    integer(p.votes ?? 0, 0, 100, 'Voturi');
    if (p.status === 'exiled') integer(p.exiledInRound, 1, 5, 'Runda exilării');
    for (const category of Rules.categories) {
      const c = p.cards[category];
      if (
        c != null &&
        (typeof c !== 'object' ||
          typeof c.id !== 'string' ||
          typeof c.title !== 'string' ||
          typeof c.image !== 'string')
      )
        throw new Error('Carte salvată invalidă.');
    }
    p.name = name(p.name, `Jucător ${i + 1}`);
    p.seat = i + 1;
    p.cards = { ...emptyCards(), ...p.cards };
  });
  Rules.validateSchedule(
    raw.exileSchedule || raw.votingSchedule,
    raw.players.length,
    raw.bunkerCapacity,
  );
  const state = {
    ...raw,
    schemaVersion: 2,
    gameId: typeof raw.gameId === 'string' && raw.gameId ? raw.gameId : randomUUID(),
    playerCount: raw.players.length,
    revision: raw.revision || 0,
    nextPlayerId: Math.max(raw.nextPlayerId || 0, ...raw.players.map((p) => p.id + 1)),
    voteSession: raw.voteSession || { stage: 'idle', candidates: [] },
    votesRegistry: raw.votesRegistry || {},
    exileSchedule: [...(raw.exileSchedule || raw.votingSchedule)],
  };
  state.votingSchedule = [...state.exileSchedule];
  if (
    !Number.isInteger(state.revision) ||
    state.revision < 0 ||
    typeof state.votesRegistry !== 'object' ||
    Array.isArray(state.votesRegistry) ||
    Object.entries(state.votesRegistry).some(
      ([id, votes]) =>
        !state.players.some((p) => String(p.id) === id) ||
        !Number.isInteger(votes) ||
        votes < 0 ||
        votes > 100,
    )
  )
    throw new Error('Voturi salvate invalide.');
  state.customSchedule =
    raw.customSchedule ??
    JSON.stringify(state.exileSchedule) !== JSON.stringify(Rules.schedule(state.playerCount));
  if (
    !['idle', 'collecting', 'result', 'defense'].includes(state.voteSession.stage) ||
    !Array.isArray(state.voteSession.candidates) ||
    state.voteSession.candidates.some(
      (id) => !state.players.some((p) => p.id === id && p.status === 'alive'),
    )
  )
    throw new Error('Sesiune de vot salvată invalidă.');
  if (
    typeof state.timer.isRunning !== 'boolean' ||
    !['speech', 'discussion', 'defense', 'custom'].includes(state.timer.type)
  )
    throw new Error('Cronometru salvat invalid.');
  if (!Number.isInteger(state.nextPlayerId)) throw new Error('Identificator salvat invalid.');
  if (
    state.activeSpeakerId != null &&
    !state.players.some((p) => p.id === state.activeSpeakerId && p.status === 'alive')
  ) {
    state.activeSpeakerId = null;
    state.timer.isRunning = false;
  }
  state.lastSpeakerId = state.players.some((p) => p.id === raw.lastSpeakerId)
    ? raw.lastSpeakerId
    : (state.activeSpeakerId ?? null);
  // Legacy running timers have no deadline: resume as paused rather than silently restart.
  if (!Number.isFinite(state.timer.endsAt)) {
    state.timer.endsAt = null;
    state.timer.isRunning = false;
  }
  integer(state.timer.duration, 1, 3600, 'Durată');
  integer(state.timer.timeLeft, 0, 7200, 'Timp');
  if (state.timer.type === 'speech' && !state.timer.isRunning && state.timer.timeLeft === 0)
    state.activeSpeakerId = null;
  return state;
}
function updateTimer(state, now = Date.now()) {
  if (state.timer.isRunning)
    state.timer.timeLeft = Math.max(0, Math.ceil((state.timer.endsAt - now) / 1000));
}
function finishTimer(state) {
  state.timer.isRunning = false;
  state.timer.endsAt = null;
  if (state.timer.type === 'speech') state.activeSpeakerId = null;
}
function publicState(state) {
  const result = clone(state);
  result.bunkerCards = result.bunkerCards.map((c) =>
    c.revealed ? c : { roundNumber: c.roundNumber, revealed: false },
  );
  return result;
}
function applyCommand(state, event, payload = {}, catalog, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Comandă invalidă.');
  const s = clone(state),
    p = payload;
  updateTimer(s, now);
  if (s.timer.isRunning && s.timer.timeLeft === 0) finishTimer(s);
  const effects = [];
  const player = (id) => {
    const found = s.players.find((x) => x.id === id);
    if (!found) throw new Error('Jucătorul nu mai există.');
    return found;
  };
  const card = (id, category) => {
    const found =
      catalog.cards.find((c) => c.id === id) || catalog.threats.find((c) => c.id === id);
    if (!found || (category && found.category !== category))
      throw new Error('Cartea nu aparține categoriei selectate.');
    return found;
  };
  const clearVotes = () => {
    s.votesRegistry = {};
    s.players.forEach((x) => (x.votes = 0));
  };
  const pause = () => {
    s.timer.isRunning = false;
    s.timer.endsAt = null;
  };
  const start = (duration, type) => {
    s.timer = {
      duration,
      timeLeft: duration,
      type,
      isRunning: true,
      endsAt: now + duration * 1000,
    };
  };
  const giveFloor = (who, autoStart = true) => {
    if (who.status !== 'alive') throw new Error('Jucătorul exilat nu poate fi vorbitor activ.');
    s.activeSpeakerId = who.id;
    s.lastSpeakerId = who.id;
    if (autoStart) {
      start(30, 'speech');
      effects.push(['audio:play', { cue: 'speaker_start' }]);
      effects.push([
        'cinematic:play',
        { scene: 'speaker', title: 'CANAL DESCHIS', subtitle: who.name },
      ]);
    }
  };
  const modal = (c, who, category = c.category) => {
    s.cardModal = {
      card: c,
      player: who ? { id: who.id, seat: who.seat, name: who.name } : null,
      category,
      title: c.title,
      description: c.description || '',
      timestamp: now,
    };
  };
  const plan = (values, capacity) => {
    const v = Rules.validateSchedule(values, s.players.length, capacity);
    s.exileSchedule = v.schedule;
    s.votingSchedule = [...v.schedule];
    s.bunkerCapacity = v.capacity;
    s.expectedExiles = v.total;
  };
  const quota = () => s.exileSchedule[s.round - 1] - Rules.exilesInRound(s);
  const requireOverride = (message) => {
    if (p.force !== true) {
      const e = new Error(message);
      e.code = 'OVERRIDE_REQUIRED';
      throw e;
    }
  };
  const exile = (who) => {
    if (s.players.filter((x) => x.status === 'alive').length <= 1)
      throw new Error('Trebuie să rămână cel puțin un supraviețuitor.');
    who.status = 'exiled';
    who.exiledInRound = s.round;
    if (s.cardModal?.player?.id === who.id) s.cardModal = null;
    if (s.activeSpeakerId === who.id) {
      s.activeSpeakerId = null;
      pause();
    }
    effects.push(
      [
        'player:exiled_announcement',
        {
          player: {
            ...who,
            profession: who.cards.profesie?.title,
            biology: who.cards.biologie?.title,
          },
          round: s.round,
        },
      ],
      ['audio:play', { cue: 'exile_stamp' }],
    );
    clearVotes();
    s.voteSession = { stage: 'idle', candidates: [] };
  };
  switch (event) {
    case 'game:setup': {
      const count = integer(p.playerCount ?? s.playerCount, 4, 22, 'Jucători');
      if (count !== s.playerCount && s.gameStatus !== 'setup')
        throw new Error(
          'Modifică lista prin butoanele Adaugă / Șterge; configurarea păstrează partida curentă.',
        );
      while (s.players.length < count) {
        const id = s.nextPlayerId++;
        s.players.push({
          id,
          seat: s.players.length + 1,
          name: `Jucător ${s.players.length + 1}`,
          status: 'alive',
          exiledInRound: null,
          votes: 0,
          cards: emptyCards(),
        });
      }
      if (s.players.length > count) s.players = s.players.slice(0, count);
      s.playerCount = count;
      if (p.mode !== undefined && !['basic', 'survival'].includes(p.mode))
        throw new Error('Mod de joc invalid.');
      if (p.goal !== undefined && !['salvare', 'renastere'].includes(p.goal))
        throw new Error('Scop invalid.');
      s.mode = p.mode || s.mode;
      s.goal = p.goal || s.goal;
      if (p.playerNames !== undefined) {
        if (!Array.isArray(p.playerNames) || p.playerNames.length !== count)
          throw new Error('Lista de nume este incompletă.');
        s.players.forEach((x, i) => (x.name = name(p.playerNames[i], x.name)));
      }
      const values = p.exileSchedule || Rules.schedule(count);
      plan(values, p.bunkerCapacity ?? count - values.reduce((a, b) => a + b, 0));
      s.customSchedule = JSON.stringify(values) !== JSON.stringify(Rules.schedule(count));
      if (p.catastropheId) s.catastrophe = card(p.catastropheId, 'catastrofe');
      if (s.gameStatus === 'setup') s.gameStatus = 'playing';
      break;
    }
    case 'player:add': {
      if (s.players.length >= 22) throw new Error('Numărul maxim este de 22 de jucători.');
      const id = s.nextPlayerId++;
      s.players.push({
        id,
        seat: s.players.length + 1,
        name: name(p.name, `Jucător ${s.players.length + 1}`),
        status: 'alive',
        exiledInRound: null,
        votes: 0,
        cards: emptyCards(),
      });
      s.playerCount = s.players.length;
      plan(s.customSchedule ? s.exileSchedule : Rules.schedule(s.playerCount));
      clearVotes();
      s.voteSession = { stage: 'idle', candidates: [] };
      break;
    }
    case 'player:remove': {
      if (s.players.length <= 4) throw new Error('Numărul minim este de 4 jucători.');
      const who = player(p.playerId ?? s.players.at(-1).id);
      s.players = s.players.filter((x) => x.id !== who.id);
      s.players.forEach((x, i) => (x.seat = i + 1));
      s.playerCount = s.players.length;
      if (s.activeSpeakerId === who.id) {
        s.activeSpeakerId = null;
        pause();
      }
      if (s.lastSpeakerId === who.id) s.lastSpeakerId = null;
      if (s.cardModal?.player?.id === who.id) s.cardModal = null;
      plan(s.customSchedule ? s.exileSchedule : Rules.schedule(s.playerCount));
      clearVotes();
      s.voteSession = { stage: 'idle', candidates: [] };
      break;
    }
    case 'player:rename':
      player(p.playerId).name = name(p.name);
      break;
    case 'schedule:update':
      plan(p.exileSchedule, p.bunkerCapacity);
      s.customSchedule = true;
      break;
    case 'player:reveal_card': {
      if (!Rules.categories.includes(p.category)) throw new Error('Categorie invalidă.');
      const who = player(p.playerId),
        c = card(p.cardId, p.category);
      if (who.status !== 'alive') throw new Error('Cartonașele jucătorului exilat sunt blocate.');
      who.cards[p.category] = c;
      if (p.showOnTv !== false) {
        modal(c, who);
        effects.push(['audio:play', { cue: 'card_reveal' }]);
      }
      break;
    }
    case 'player:unreveal_card': {
      if (!Rules.categories.includes(p.category)) throw new Error('Categorie invalidă.');
      const who = player(p.playerId);
      if (who.status !== 'alive') throw new Error('Cartonașele jucătorului exilat sunt blocate.');
      who.cards[p.category] = null;
      if (s.cardModal?.player?.id === p.playerId && s.cardModal.category === p.category)
        s.cardModal = null;
      break;
    }
    case 'player:toggle_exile': {
      const who = player(p.playerId);
      if (who.status === 'alive') {
        if (quota() <= 0)
          requireOverride(
            'Planul acestei runde este îndeplinit. Confirmi exilarea manuală suplimentară?',
          );
        exile(who);
      } else {
        who.status = 'alive';
        who.exiledInRound = null;
        effects.push(
          ['cinematic:play', { scene: 'readmit', title: 'ACCES RESTABILIT', subtitle: who.name }],
          ['audio:play', { cue: 'readmit' }],
        );
        clearVotes();
        s.voteSession = { stage: 'idle', candidates: [] };
      }
      break;
    }
    case 'speaker:set': {
      if (p.playerId === null) {
        s.activeSpeakerId = null;
        pause();
      } else {
        giveFloor(player(p.playerId), p.autoStartTimer !== false);
      }
      break;
    }
    case 'speaker:next': {
      if (s.phase === 'finale' || ['collecting', 'result', 'defense'].includes(s.voteSession.stage))
        throw new Error('Încheie etapa curentă înainte de a schimba vorbitorul.');
      const index = s.players.findIndex((who) => who.id === s.lastSpeakerId);
      const ordered = [...s.players.slice(index + 1), ...s.players.slice(0, index + 1)];
      const next = ordered.find((who) => who.status === 'alive' && who.id !== s.activeSpeakerId);
      if (!next) throw new Error('Nu există un alt vorbitor eligibil.');
      giveFloor(next);
      break;
    }
    case 'timer:control': {
      if (p.action === 'start') {
        if (s.timer.timeLeft <= 0) s.timer.timeLeft = s.timer.duration;
        s.timer.isRunning = true;
        s.timer.endsAt = now + s.timer.timeLeft * 1000;
      } else if (p.action === 'pause') pause();
      else if (p.action === 'reset') {
        pause();
        s.timer.timeLeft = s.timer.duration;
      } else if (p.action === 'set') {
        const duration = integer(p.duration, 1, 3600, 'Durată');
        if (p.type !== undefined && !['speech', 'discussion', 'defense', 'custom'].includes(p.type))
          throw new Error('Tip cronometru invalid.');
        start(duration, p.type || 'custom');
      } else if (p.action === 'add') {
        const extra = integer(p.addSeconds, 1, 3600, 'Secunde');
        integer(s.timer.timeLeft + extra, 0, 7200, 'Timp');
        s.timer.timeLeft += extra;
        if (s.timer.isRunning) s.timer.endsAt = now + s.timer.timeLeft * 1000;
      } else throw new Error('Acțiune cronometru invalidă.');
      break;
    }
    case 'bunker:reveal': {
      const index = integer(p.index, 0, 4, 'Modul');
      const c = s.bunkerCards[index];
      if (!c) throw new Error('Modul inexistent.');
      c.revealed = true;
      modal(c, null, 'bunker');
      effects.push(['audio:play', { cue: 'bunker_reveal' }]);
      break;
    }
    case 'bunker:replace': {
      const index = integer(p.index, 0, 4, 'Modul');
      s.bunkerCards[index] = {
        ...card(p.cardId, 'bunker'),
        roundNumber: index + 1,
        revealed: true,
      };
      break;
    }
    case 'catastrophe:select': {
      s.catastrophe = p.isRandom
        ? shuffle(catalog.cards.filter((c) => c.category === 'catastrofe'))[0]
        : card(p.cardId, 'catastrofe');
      if (!s.catastrophe) throw new Error('Catalogul nu conține catastrofe.');
      modal(s.catastrophe);
      effects.push(['audio:play', { cue: 'catastrophe_alarm' }]);
      break;
    }
    case 'threat:draw': {
      if (s.mode !== 'survival' || s.phase !== 'finale')
        throw new Error('Amenințările se extrag în epilogul modului Supraviețuire.');
      const c = shuffle(
        catalog.threats.filter((t) => !s.revealedThreats.some((x) => x.id === t.id)),
      )[0];
      if (!c) throw new Error('Toate amenințările au fost extrase.');
      s.revealedThreats.push(c);
      modal(c, null, 'amenintare');
      effects.push(['audio:play', { cue: 'threat_alarm' }]);
      break;
    }
    case 'game:set_phase': {
      if (p.fromRound !== undefined && (p.fromRound !== s.round || p.fromPhase !== s.phase))
        throw new Error('Runda sau faza a fost schimbată din altă consolă. Alege din nou.');
      const round = p.round === undefined ? s.round : integer(p.round, 1, 5, 'Rundă');
      const phase = p.phase || s.phase;
      if (!Rules.phases.includes(phase)) throw new Error('Fază invalidă.');
      if (phase === 'tiebreak')
        throw new Error('Folosește butonul de balotaj pentru candidații aflați la egalitate.');
      if (
        round === s.round &&
        phase === 'voting' &&
        phase === s.phase &&
        s.players.some((who) => who.votes > 0)
      )
        requireOverride('Confirmi ștergerea numărătorii din votul curent?');
      if (phase === 'voting' && quota() <= 0 && round === s.round)
        requireOverride(
          'Nu mai sunt exilări prevăzute în această rundă. Confirmi votarea manuală?',
        );
      if (round > s.round || phase === 'finale' || phase === 'round_end') {
        const pending = s.exileSchedule
          .slice(0, phase === 'finale' ? 5 : round > s.round ? round - 1 : s.round)
          .some((n, i) => Rules.exilesInRound(s, i + 1) !== n);
        if (pending)
          requireOverride('Exilările nu corespund planului. Confirmi continuarea manuală?');
        if (
          phase === 'finale' &&
          s.players.filter((x) => x.status === 'alive').length !== s.bunkerCapacity
        )
          requireOverride(
            'Numărul supraviețuitorilor diferă de capacitatea buncărului. Confirmi epilogul manual?',
          );
      }
      if (round !== s.round || phase !== s.phase || ['discussion', 'voting'].includes(phase)) {
        clearVotes();
        s.voteSession = { stage: phase === 'voting' ? 'collecting' : 'idle', candidates: [] };
      }
      if (round !== s.round)
        effects.push(
          [
            'cinematic:play',
            { scene: 'round', title: `RUNDA ${round}`, subtitle: 'O nouă etapă de supraviețuire' },
          ],
          ['audio:play', { cue: 'round_transition' }],
        );
      else if (phase !== s.phase && phase === 'finale')
        effects.push(
          [
            'cinematic:play',
            {
              scene: 'finale',
              title: 'SUPRAVIEȚUITORII',
              subtitle: 'Buncărul își închide porțile',
            },
          ],
          ['audio:play', { cue: 'victory' }],
        );
      else if (phase !== s.phase && phase === 'voting')
        effects.push(
          [
            'cinematic:play',
            {
              scene: 'voting',
              title: 'VOTARE DESCHISĂ',
              subtitle: 'Decizia voastră schimbă destine',
            },
          ],
          ['audio:play', { cue: 'vote_open' }],
        );
      if (round !== s.round) s.lastSpeakerId = null;
      s.round = round;
      s.phase = phase;
      s.gameStatus = phase === 'finale' ? 'finale' : 'playing';
      s.activeSpeakerId = null;
      pause();
      if (phase === 'discussion') start(60, 'discussion');
      break;
    }
    case 'votes:start': {
      if (s.voteSession.stage === 'collecting' && s.players.some((who) => who.votes > 0))
        throw new Error('Votarea este deja deschisă.');
      if (s.voteSession.stage === 'result')
        requireOverride('Confirmi înlocuirea rezultatului închis cu un vot nou?');
      if (quota() <= 0)
        requireOverride(
          'Nu mai sunt exilări prevăzute în această rundă. Confirmi un vot suplimentar?',
        );
      if (s.phase === 'finale') throw new Error('Revino la o rundă înainte de votare.');
      clearVotes();
      s.voteSession = {
        stage: 'collecting',
        candidates: p.restart ? [] : s.voteSession.candidates || [],
      };
      s.phase = s.voteSession.candidates.length ? 'tiebreak' : 'voting';
      effects.push(
        [
          'cinematic:play',
          {
            scene: 'voting',
            title: 'VOTARE DESCHISĂ',
            subtitle: s.voteSession.candidates.length
              ? 'Balotaj • decizia finală'
              : 'Decizia voastră schimbă destine',
          },
        ],
        ['audio:play', { cue: 'vote_open' }],
      );
      s.activeSpeakerId = null;
      pause();
      break;
    }
    case 'votes:adjust': {
      if (!['voting', 'tiebreak'].includes(s.phase) || s.voteSession.stage !== 'collecting')
        throw new Error('Pornește o sesiune de vot.');
      const who = player(p.playerId);
      if (
        who.status !== 'alive' ||
        (s.voteSession.candidates.length && !s.voteSession.candidates.includes(who.id))
      )
        throw new Error('Jucătorul nu participă la acest vot.');
      integer(p.delta, -1, 1, 'Vot');
      who.votes = Math.max(0, (who.votes || 0) + p.delta);
      integer(who.votes, 0, 100, 'Voturi');
      s.votesRegistry[who.id] = who.votes;
      break;
    }
    case 'votes:record': {
      if (!p.votes || typeof p.votes !== 'object' || Array.isArray(p.votes))
        throw new Error('Voturi invalide.');
      if (Object.keys(p.votes).length)
        throw new Error(
          'Folosește comenzile individuale pentru a evita pierderea voturilor simultane.',
        );
      if (!['collecting', 'result'].includes(s.voteSession.stage))
        throw new Error('Nu există un vot de resetat.');
      if (s.voteSession.stage === 'result' || s.players.some((who) => who.votes > 0))
        requireOverride('Confirmi ștergerea voturilor și redeschiderea numărătorii?');
      clearVotes();
      s.voteSession.stage = 'collecting';
      break;
    }
    case 'votes:result': {
      if (!['voting', 'tiebreak'].includes(s.phase) || s.voteSession.stage !== 'collecting')
        throw new Error('Nu există un vot în desfășurare.');
      const top = Rules.topCandidates(s);
      if (!top.length) throw new Error('Înregistrează cel puțin un vot.');
      s.voteSession.stage = 'result';
      effects.push(
        [
          'cinematic:play',
          {
            scene: 'result',
            title: 'VOTURI NUMĂRATE',
            subtitle:
              top.length > 1
                ? 'Egalitate • urmează balotajul'
                : 'Verdictul așteaptă confirmarea moderatorului',
          },
        ],
        ['audio:play', { cue: 'vote_result' }],
      );
      break;
    }
    case 'votes:tiebreak': {
      if (!['voting', 'tiebreak'].includes(s.phase) || s.voteSession.stage !== 'result')
        throw new Error('Închide votarea înainte de balotaj.');
      const top = Rules.topCandidates(s);
      if (top.length < 2) throw new Error('Nu există egalitate de voturi.');
      clearVotes();
      s.voteSession = { stage: 'defense', candidates: top };
      s.phase = 'tiebreak';
      s.activeSpeakerId = null;
      start(30, 'defense');
      break;
    }
    case 'votes:exile': {
      const top = Rules.topCandidates(s);
      if (
        !['voting', 'tiebreak'].includes(s.phase) ||
        s.voteSession.stage !== 'result' ||
        top.length !== 1 ||
        top[0] !== p.playerId
      )
        throw new Error('Confirmă rezultatul unui vot fără egalitate.');
      if (quota() <= 0) requireOverride('Confirmi exilarea suplimentară față de plan?');
      exile(player(p.playerId));
      break;
    }
    case 'modal:close':
      s.cardModal = null;
      break;
    case 'modal:show': {
      if (p.playerId != null && player(p.playerId).status !== 'alive')
        throw new Error('Cartonașele jucătorului exilat sunt blocate.');
      modal(card(p.cardId), p.playerId ? player(p.playerId) : null, p.category);
      break;
    }
    default:
      throw new Error('Comandă necunoscută.');
  }
  s.revision = (state.revision || 0) + 1;
  s.lastUpdate = now;
  return { state: s, effects };
}
module.exports = {
  createState,
  migrate,
  applyCommand,
  publicState,
  updateTimer,
  finishTimer,
  Rules,
};
