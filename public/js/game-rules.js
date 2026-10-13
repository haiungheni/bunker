(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.BunkerRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const schedules = {
    4: [0, 0, 0, 1, 1],
    5: [0, 0, 1, 1, 1],
    6: [0, 0, 1, 1, 1],
    7: [0, 1, 1, 1, 1],
    8: [0, 1, 1, 1, 1],
    9: [0, 1, 1, 1, 2],
    10: [0, 1, 1, 1, 2],
    11: [0, 1, 1, 2, 2],
    12: [0, 1, 1, 2, 2],
    13: [0, 1, 2, 2, 2],
    14: [0, 1, 2, 2, 2],
    15: [0, 2, 2, 2, 2],
    16: [0, 2, 2, 2, 2],
    17: [0, 2, 2, 2, 3],
    18: [0, 2, 2, 2, 3],
    19: [0, 2, 2, 3, 3],
    20: [0, 2, 2, 3, 3],
    21: [0, 2, 3, 3, 3],
    22: [0, 2, 3, 3, 3],
  };
  const categories = [
    'profesie',
    'biologie',
    'sanatate',
    'hobby',
    'bagaj',
    'fapte',
    'conditii_speciale',
  ];
  const phases = [
    'bunker_reveal',
    'card_reveal',
    'discussion',
    'voting',
    'tiebreak',
    'round_end',
    'finale',
  ];
  const normalize = (text) =>
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  function schedule(count) {
    if (!schedules[count]) throw new Error('Numărul de jucători trebuie să fie între 4 și 22.');
    return [...schedules[count]];
  }
  function validateSchedule(values, count, capacity) {
    if (
      !Array.isArray(values) ||
      values.length !== 5 ||
      values.some((v) => !Number.isInteger(v) || v < 0)
    )
      throw new Error('Planul trebuie să conțină cinci numere întregi pozitive sau zero.');
    const total = values.reduce((a, b) => a + b, 0);
    if (capacity === undefined) capacity = count - total;
    if (
      total >= count ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > count ||
      total + capacity !== count
    )
      throw new Error(
        'Exilările și locurile în buncăr trebuie să însumeze numărul de jucători, cu cel puțin un supraviețuitor.',
      );
    return { schedule: [...values], capacity, total };
  }
  function exilesInRound(state, round = state.round) {
    return state.players.filter((p) => p.status === 'exiled' && p.exiledInRound === round).length;
  }
  function topCandidates(state) {
    const eligible = state.players.filter(
      (p) =>
        p.status === 'alive' &&
        (!state.voteSession?.candidates?.length || state.voteSession.candidates.includes(p.id)),
    );
    const max = Math.max(0, ...eligible.map((p) => p.votes || 0));
    return max ? eligible.filter((p) => p.votes === max).map((p) => p.id) : [];
  }
  // Unknown card metadata remains unknown: never derive game outcomes from age or real-world assumptions.
  function fertility(player) {
    const biology = player.cards.biologie?.gameTraits;
    const health = player.cards.sanatate?.gameTraits;
    if (!biology || !health || !['male', 'female'].includes(biology.sex))
      return { status: 'unknown' };
    if (biology.fertile === false || health.preventsReproduction === true)
      return { status: 'ineligible' };
    if (biology.fertile !== true || health.preventsReproduction !== false)
      return { status: 'unknown' };
    return { status: 'eligible', sex: biology.sex };
  }
  function reproduction(state) {
    const alive = state.players.filter((p) => p.status === 'alive');
    const traits = alive.map(fertility);
    if (
      traits.some((t) => t.status === 'eligible' && t.sex === 'male') &&
      traits.some((t) => t.status === 'eligible' && t.sex === 'female')
    )
      return 'met';
    return traits.some((t) => t.status === 'unknown') ? 'unknown' : 'unmet';
  }
  return {
    categories,
    phases,
    schedule,
    validateSchedule,
    exilesInRound,
    topCandidates,
    normalize,
    reproduction,
  };
});
