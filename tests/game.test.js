const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  createState,
  migrate,
  applyCommand,
  publicState,
  updateTimer,
  finishTimer,
  Rules,
} = require('../lib/game');
const catalog = JSON.parse(fs.readFileSync(require.resolve('../data/cards.json'), 'utf8'));
const apply = (state, event, payload) => applyCommand(state, event, payload, catalog, 10000).state;

test('exiled dossiers cannot reveal, hide or open cards until readmitted', () => {
  const card = catalog.cards.find((c) => c.category === 'profesie');
  let s = apply(createState(catalog, 8), 'player:reveal_card', {
    playerId: 1,
    category: 'profesie',
    cardId: card.id,
  });
  s = apply(s, 'player:toggle_exile', { playerId: 1, force: true });
  assert.equal(s.cardModal, null);
  for (const [event, payload] of [
    ['player:reveal_card', { playerId: 1, category: 'profesie', cardId: card.id }],
    ['player:unreveal_card', { playerId: 1, category: 'profesie' }],
    ['modal:show', { playerId: 1, category: 'profesie', cardId: card.id }],
  ])
    assert.throws(() => apply(s, event, payload), /exilat/);
  s = apply(s, 'player:toggle_exile', { playerId: 1 });
  s = apply(s, 'modal:show', { playerId: 1, category: 'profesie', cardId: card.id });
  assert.equal(s.cardModal.player.id, 1);
});

test('ending a speech clears its speaker and deadline, including repeated stops', () => {
  let s = createState(catalog, 8);
  for (let i = 0; i < 3; i++) {
    s = apply(s, 'speaker:set', { playerId: 1 });
    assert.equal(s.timer.isRunning, true);
    s = apply(s, 'speaker:set', { playerId: null });
    s = apply(s, 'speaker:set', { playerId: null });
    assert.equal(s.activeSpeakerId, null);
    assert.equal(s.timer.isRunning, false);
    assert.equal(s.timer.endsAt, null);
  }
});

test('all player counts produce consistent plans and unique bunker cards', () => {
  for (let count = 4; count <= 22; count++) {
    const s = createState(catalog, count);
    assert.equal(s.expectedExiles + s.bunkerCapacity, count);
    assert.equal(new Set(s.bunkerCards.map((c) => c.id)).size, 5);
    Rules.validateSchedule(s.exileSchedule, count, s.bunkerCapacity);
  }
});
test('invalid commands are rejected without partial changes', () => {
  const s = createState(catalog, 8),
    before = structuredClone(s);
  for (const [event, payload] of [
    ['schedule:update', { exileSchedule: [22, 22, 22, 22, 22] }],
    ['schedule:update', {}],
    ['player:rename', { playerId: 1, name: 42 }],
    ['player:rename', { playerId: 1 }],
    ['player:reveal_card', { playerId: 1, category: 'profesie', cardId: s.bunkerCards[0].id }],
    ['player:reveal_card', { playerId: 1, category: '__proto__', cardId: s.bunkerCards[0].id }],
    ['timer:control', { action: 'set', duration: -1 }],
    ['speaker:set', { playerId: 100 }],
    ['game:set_phase', { phase: 'bogus' }],
    ['votes:record', {}],
    ['game:setup', { playerCount: 7.5 }],
    ['votes:record', { votes: { 1: -4 } }],
  ])
    assert.throws(() => apply(s, event, payload), event);
  assert.deepEqual(s, before);
});
test('removing players preserves identities and speaker, adding never reuses IDs', () => {
  let s = createState(catalog, 8);
  s = apply(s, 'speaker:set', { playerId: 3 });
  s = apply(s, 'player:remove', { playerId: 2 });
  assert.equal(s.activeSpeakerId, 3);
  assert.equal(s.players.find((p) => p.id === 3).name, 'Jucător 3');
  assert.equal(s.players.find((p) => p.id === 3).seat, 2);
  s = apply(s, 'player:add', {});
  assert.equal(s.players.at(-1).id, 9);
  s = apply(s, 'player:remove', { playerId: 3 });
  assert.equal(s.activeSpeakerId, null);
  assert.equal(s.timer.isRunning, false);
});
test('configuration preserves game progress and cards; a new game is clean', () => {
  let s = createState(catalog, 8);
  s = apply(s, 'bunker:reveal', { index: 0 });
  s = apply(s, 'speaker:set', { playerId: 3 });
  s = apply(s, 'game:setup', { playerCount: 8, mode: 'survival', goal: 'salvare' });
  assert.equal(s.bunkerCards[0].revealed, true);
  assert.equal(s.activeSpeakerId, 3);
  const fresh = createState(catalog, 8);
  assert.equal(fresh.timer.isRunning, false);
  assert.equal(fresh.cardModal, null);
  assert.equal(
    fresh.bunkerCards.some((c) => c.revealed),
    false,
  );
});
test('voting requires explicit result, limits tiebreak candidates, resets after exile', () => {
  let s = createState(catalog, 10);
  s = apply(s, 'game:set_phase', { round: 2, phase: 'discussion' });
  s = apply(s, 'votes:start', {});
  s = apply(s, 'votes:adjust', { playerId: 1, delta: 1 });
  s = apply(s, 'votes:adjust', { playerId: 2, delta: 1 });
  assert.throws(() => apply(s, 'votes:exile', { playerId: 1 }));
  s = apply(s, 'votes:result', {});
  s = apply(s, 'votes:tiebreak', {});
  assert.deepEqual(s.voteSession.candidates, [1, 2]);
  assert.equal(s.players[0].votes, 0);
  s = apply(s, 'votes:start', {});
  assert.throws(() => apply(s, 'votes:adjust', { playerId: 3, delta: 1 }));
  s = apply(s, 'votes:adjust', { playerId: 1, delta: 1 });
  s = apply(s, 'votes:result', {});
  s = apply(s, 'votes:exile', { playerId: 1 });
  assert.equal(s.players[0].status, 'exiled');
  assert.equal(s.voteSession.stage, 'idle');
  assert.deepEqual(s.votesRegistry, {});
  assert.throws(() => apply(s, 'votes:start', {}), { code: 'OVERRIDE_REQUIRED' });
});
test('successive votes in a multi-exile round start with zero votes', () => {
  let s = createState(catalog, 10);
  s = apply(s, 'game:set_phase', { round: 5, phase: 'voting', force: true });
  for (const id of [1, 2]) {
    s = apply(s, 'votes:start', {});
    assert.ok(s.players.every((p) => p.votes === 0));
    s = apply(s, 'votes:adjust', { playerId: id, delta: 1 });
    s = apply(s, 'votes:result', {});
    s = apply(s, 'votes:exile', { playerId: id });
  }
  assert.equal(Rules.exilesInRound(s), 2);
});
test('leaving voting invalidates its pending result', () => {
  let s = createState(catalog, 10);
  s = apply(s, 'game:set_phase', { round: 2, phase: 'voting' });
  s = apply(s, 'votes:adjust', { playerId: 1, delta: 1 });
  s = apply(s, 'votes:result', {});
  s = apply(s, 'game:set_phase', { phase: 'card_reveal' });
  assert.throws(() => apply(s, 'votes:exile', { playerId: 1 }));
  assert.equal(s.voteSession.stage, 'idle');
});
test('phase progression warns about pending exiles and retains manual override', () => {
  const s = createState(catalog, 8);
  assert.throws(() => apply(s, 'game:set_phase', { round: 3, phase: 'bunker_reveal' }), {
    code: 'OVERRIDE_REQUIRED',
  });
  assert.equal(
    apply(s, 'game:set_phase', { round: 3, phase: 'bunker_reveal', force: true }).round,
    3,
  );
});
test('deadlines handle delayed ticks, pauses and added time', () => {
  let s = createState(catalog, 8);
  s = apply(s, 'timer:control', { action: 'set', duration: 60, type: 'discussion' });
  updateTimer(s, 25500);
  assert.equal(s.timer.timeLeft, 45);
  s = applyCommand(s, 'timer:control', { action: 'pause' }, catalog, 25500).state;
  updateTimer(s, 50000);
  assert.equal(s.timer.timeLeft, 45);
  s = applyCommand(s, 'timer:control', { action: 'start' }, catalog, 50000).state;
  updateTimer(s, 100000);
  assert.equal(s.timer.timeLeft, 0);
});
test('public state hides unrevealed bunker identities without mutating full state', () => {
  const s = createState(catalog, 8),
    view = publicState(s);
  assert.deepEqual(Object.keys(view.bunkerCards[0]), ['roundNumber', 'revealed']);
  assert.ok(s.bunkerCards[0].id);
});
test('migration accepts the existing game and pauses legacy timers without deadlines', () => {
  const saved = createState(catalog, 8);
  delete saved.gameId;
  delete saved.lastSpeakerId;
  delete saved.exileSchedule;
  const s = migrate(saved);
  assert.equal(s.schemaVersion, 2);
  assert.ok(s.gameId);
  assert.ok(s.nextPlayerId > Math.max(...s.players.map((p) => p.id)));
  const legacy = createState(catalog, 8);
  delete legacy.timer.endsAt;
  legacy.timer.isRunning = true;
  assert.equal(migrate(legacy).timer.isRunning, false);
  assert.throws(() => migrate({ ...legacy, players: null }));
  assert.throws(() => migrate({ ...legacy, bunkerCards: [null, null, null, null, null] }));
  assert.throws(() => migrate({ ...legacy, votesRegistry: { 1: -1 } }));
});
test('expired speeches release the floor and advance to the next eligible player', () => {
  let s = createState(catalog, 8);
  s = apply(s, 'player:toggle_exile', { playerId: 2, force: true });
  s = apply(s, 'speaker:set', { playerId: 1 });
  updateTimer(s, 40000);
  finishTimer(s);
  assert.equal(s.timer.timeLeft, 0);
  assert.equal(s.activeSpeakerId, null);
  assert.equal(s.lastSpeakerId, 1);
  s = apply(s, 'speaker:next', {});
  assert.equal(s.activeSpeakerId, 3);
  assert.equal(s.timer.isRunning, true);
});
test('closed vote totals are retained until a reset is confirmed', () => {
  let s = apply(createState(catalog, 8), 'game:set_phase', { round: 2, phase: 'voting' });
  s = apply(s, 'votes:adjust', { playerId: 1, delta: 1 });
  assert.throws(() => apply(s, 'votes:start', {}));
  s = apply(s, 'votes:result', {});
  assert.throws(() => apply(s, 'votes:record', { votes: {} }), { code: 'OVERRIDE_REQUIRED' });
  assert.throws(() => apply(s, 'votes:start', {}), { code: 'OVERRIDE_REQUIRED' });
  assert.equal(s.players[0].votes, 1);
  s = apply(s, 'votes:record', { votes: {}, force: true });
  assert.equal(s.voteSession.stage, 'collecting');
  assert.equal(s.players[0].votes, 0);
});
test('reproduction remains unknown until explicit card metadata exists', () => {
  const s = createState(catalog, 4);
  assert.equal(Rules.reproduction(s), 'unknown');
  s.players = s.players.slice(0, 2);
  for (const [i, p] of s.players.entries())
    p.cards = {
      biologie: { gameTraits: { sex: i ? 'female' : 'male', fertile: true } },
      sanatate: { gameTraits: { preventsReproduction: false } },
    };
  assert.equal(Rules.reproduction(s), 'met');
  s.players[0].cards.sanatate.gameTraits.preventsReproduction = true;
  assert.equal(Rules.reproduction(s), 'unmet');
});
