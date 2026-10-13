const { test, expect } = require('@playwright/test');

test('moderator and TV initialize, synchronize safely, vote, undo, archive and reconnect', async ({
  page,
  context,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.player-card')).toHaveCount(10);
  await expect(page.locator('#saveStatus')).toHaveText('Partidă salvată');
  const tv = await context.newPage();
  tv.on('pageerror', (error) => errors.push(error.message));
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto('/tv');
  await expect(tv.locator('.tv-player-card')).toHaveCount(6);
  await expect(page.locator('#tvStatusBadge')).toContainText('1 TV');
  await expect(tv.locator('.sealed-sector')).toHaveCount(5);
  await page
    .locator('[data-tab="tab-settings"]')
    .count()
    .then(async (count) => {
      if (count) await page.locator('[data-tab="tab-settings"]').click();
    });
  await expect(page.locator('#tvQrCode svg')).toHaveCount(1);

  const malicious = '<img src=x onerror="window.pwned=1">';
  const firstName = page.locator('.player-name-input').first();
  await firstName.fill(malicious);
  await firstName.press('Enter');
  await expect(tv.locator('.tv-player-name').first()).toHaveText(malicious);
  expect(await tv.evaluate(() => window.pwned)).toBeUndefined();
  await page.locator('#btnGameSetup').click();
  await expect(page.locator('.setup-name-input').first()).toHaveValue(malicious);
  await page.locator('#btnSaveSetup').click();
  await expect(page.locator('#gameSetupModal')).not.toHaveClass(/active/);
  await page.locator('#btnNextRound').click();
  await expect(page.locator('#headerRoundVal')).toHaveText('2 / 5');
  await page.locator('[data-tab="tab-voting"]').click();
  await page.locator('#btnStartVoteDiscussion').click();
  await expect(tv.locator('#tvSpeakerBar')).toHaveClass(/active/);
  await expect(tv.locator('#tvSpeakerName')).toHaveText('Discuție de grup');
  await page.locator('#btnStartVoting').click();
  await expect(page.locator('#voteSessionStatus')).toContainText('Votare deschisă');
  await page.locator('.candidate-box .vote-btn').nth(1).click();
  await page.locator('.candidate-box .vote-btn').nth(3).click();
  await page.locator('#btnCloseVoting').click();
  await expect(page.locator('#topVotedCandidate')).toContainText('BALOTAJ');
  await page.locator('#btnTiebreakTimer').click();
  await expect(page.locator('#votingCandidatesGrid .candidate-box')).toHaveCount(2);
  await page.locator('#btnStartVoting').click();
  await page.locator('#votingCandidatesGrid .vote-btn').nth(1).click();
  await page.locator('#btnCloseVoting').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnExileTopCandidate').click();
  await expect(page.locator('#voteSessionStatus')).toContainText('1 / 1');
  await page.locator('#btnUndo').click();
  await expect(page.locator('#voteSessionStatus')).toContainText('0 / 1');

  await tv.locator('#tvNextPage').click();
  await expect(tv.locator('#tvPageIndicator')).toContainText('Pagina 2 /');
  await tv.reload();
  await expect(tv.locator('.tv-player-card').first()).toBeVisible();
  const visibleCount = await tv.locator('.tv-player-card').count();
  expect(visibleCount).toBeGreaterThanOrEqual(2);
  expect(visibleCount).toBeLessThanOrEqual(6);
  const api = await (await request.get('/api/state')).json();
  expect(api.bunkerCards[0].id).toBeUndefined();
  const forbidden = await request.post('/api/reset', { data: { playerCount: 8 } });
  expect(forbidden.status()).toBe(401);
  const denied = await request.post('/api/session', {
    headers: { Host: 'bunker.local' },
    data: { pin: 'wrong' },
  });
  expect(denied.status()).toBe(401);
  const accepted = await request.post('/api/session', {
    headers: { Host: 'bunker.local' },
    data: { pin: '654321' },
  });
  expect(accepted.ok()).toBe(true);
  const token = (await accepted.json()).token;
  const readOnly = await tv.evaluate(async () => {
    const socket = io({ query: { role: 'tv' } });
    await new Promise((resolve) => socket.on('connect', resolve));
    const result = await socket
      .timeout(3000)
      .emitWithAck('player:rename', { playerId: 1, name: 'Unauthorized' });
    socket.disconnect();
    return result;
  });
  expect(readOnly.success).toBe(false);

  await context.setOffline(true);
  await expect(page.locator('#tvStatusBadge')).toContainText('Deconectat', { timeout: 30000 });
  await page.locator('#btnUndo').click();
  await expect(page.locator('.mod-toast')).toContainText('deconectat');
  await context.setOffline(false);
  await expect(page.locator('#tvStatusBadge')).toContainText('TV conectat', { timeout: 30000 });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnResetGame').click();
  await expect(page.locator('#headerRoundVal')).toHaveText('1 / 5');
  await page.locator('#btnHistory').click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('#btnCloseHistory').click();
  const history = await (
    await request.get('/api/history', { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  expect(history).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('phone controls remain usable and the TV supports 22 players without tiny text', async ({
  page,
  request,
}) => {
  const token = (await (await request.post('/api/session', { data: {} })).json()).token;
  await request.post('/api/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { playerCount: 22 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.player-card')).toHaveCount(22);
  await page.locator('#btnGameSetup').click();
  await expect(page.locator('#btnSaveSetup')).toBeVisible();
  await page.locator('#btnSaveSetup').click();
  await expect(page.locator('#gameSetupModal')).not.toHaveClass(/active/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/moderator-mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tv');
  await expect(page.locator('.tv-player-card')).toHaveCount(6);
  await expect(page.locator('#tvPageIndicator')).toContainText('/ 4');
  expect(
    await page
      .locator('.tv-slot-cat-name')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(12);
  const clipped = await page
    .locator('.tv-player-card')
    .evaluateAll((cards) =>
      cards.some((el) => el.getBoundingClientRect().bottom > window.innerHeight),
    );
  expect(clipped).toBe(false);
  await page.screenshot({ path: 'artifacts/bunker-tv.png' });
});

test('card picker searches without diacritics, reveals images and retains state on refresh', async ({
  page,
  context,
  request,
}) => {
  const token = (await (await request.post('/api/session', { data: {} })).json()).token;
  await request.post('/api/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { playerCount: 8 },
  });
  const catalog = await (await request.get('/api/cards')).json();
  const card = catalog.cards.find((c) => c.category === 'sanatate' && /[ăâîșț]/i.test(c.title));
  expect(card).toBeTruthy();
  await page.route('**/api/cards', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.player-card')).toHaveCount(8);
  const tv = await context.newPage();
  await tv.goto('/tv');
  await page.locator('.player-card').first().locator('.cat-sanatate .slot-btn-add').click();
  const query = card.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  await page.locator('#cardSearchInput').fill(query);
  await expect(page.locator('#cardCategoryFilter')).toBeDisabled();
  await page.locator('.picker-card-item').filter({ hasText: card.title }).click();
  await expect(tv.locator('#tvModalCardTitle')).toHaveText(card.title);
  await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
  await expect
    .poll(() =>
      tv.locator('#tvModalCardImg').evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.locator('.player-card').first().locator('.cat-sanatate .slot-title'),
  ).toHaveText(card.title);
  const state = await (
    await request.get('/api/state', { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  await tv.evaluate(
    async ({ token, cards, playerIds }) => {
      const socket = io({ query: { role: 'moderator' }, auth: { token } });
      await new Promise((resolve) => socket.on('connect', resolve));
      for (const playerId of playerIds)
        for (const card of cards) {
          const result = await socket.timeout(3000).emitWithAck('player:reveal_card', {
            playerId,
            cardId: card.id,
            category: card.category,
            showOnTv: false,
          });
          if (!result.success) throw new Error(result.message);
          await new Promise((resolve) => setTimeout(resolve, 35));
        }
      socket.disconnect();
    },
    {
      token,
      cards: [
        'profesie',
        'biologie',
        'sanatate',
        'hobby',
        'bagaj',
        'fapte',
        'conditii_speciale',
      ].map(
        (category) =>
          catalog.cards
            .filter((c) => c.category === category)
            .sort((a, b) => b.title.length - a.title.length)[0],
      ),
      playerIds: state.players.slice(0, 6).map((p) => p.id),
    },
  );
  await tv.locator('#tvCinematicModal').click();
  await expect(tv.locator('#tvCinematicModal')).not.toHaveClass(/active/);
  await expect(tv.locator('#tvCinematicModal')).toHaveCSS('opacity', '0');
  const clipped = await tv
    .locator('.tv-player-card')
    .evaluateAll((cards) =>
      cards.some((el) => el.getBoundingClientRect().bottom > window.innerHeight),
    );
  expect(clipped).toBe(false);
  await tv.screenshot({ path: 'artifacts/bunker-tv-revealed.png' });
});

test('a moderator outside localhost must enter a valid PIN', async ({ page }) => {
  await page.goto('http://127.0.0.2:43187/');
  await expect(page.locator('#moderatorLogin')).toBeVisible();
  await page.locator('#moderatorPin').fill('000000');
  await page.locator('#loginForm button').click();
  await expect(page.locator('#loginMessage')).toContainText('PIN incorect');
  await page.locator('#moderatorPin').fill('654321');
  await page.locator('#loginForm button').click();
  await expect(page.locator('.player-card')).toHaveCount(8);
  await expect(page.locator('#moderatorLogin')).toBeHidden();
});

test('TV honors manual density, fits all 22 dossiers and plays cinematic protocols', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const token = (await (await request.post('/api/session', { data: {} })).json()).token;
  await request.post('/api/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { playerCount: 22 },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tv');
  await expect(page.locator('.tv-player-card').first()).toBeVisible();
  await page.locator('#tvPageSize').selectOption('12');
  await expect(page.locator('.tv-player-card')).toHaveCount(12);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.tv-player-card')).toHaveCount(12);
  await page.locator('#tvPageSize').selectOption('all');
  await expect(page.locator('.tv-player-card')).toHaveCount(22);
  await expect(page.locator('#tvNextPage')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#tvPageSize')).toHaveValue('all');
  await expect(page.locator('.tv-player-card')).toHaveCount(22);
  const clipped = await page.locator('.tv-player-card').evaluateAll((cards) =>
    cards.some((card) => {
      const r = card.getBoundingClientRect();
      return (
        r.bottom > innerHeight ||
        r.right > innerWidth ||
        r.top < 0 ||
        r.height < 100 ||
        card.scrollHeight > card.clientHeight + 2
      );
    }),
  );
  expect(clipped).toBe(false);
  await page.screenshot({ path: 'artifacts/bunker-tv-all.png' });
  const result = await page.evaluate(async (token) => {
    const socket = io({ autoConnect: false, auth: { token }, query: { role: 'moderator' } });
    await new Promise((resolve) => {
      socket.once('connect', resolve);
      socket.connect();
    });
    const response = await socket
      .timeout(3000)
      .emitWithAck('game:set_phase', { round: 2, phase: 'card_reveal', force: true });
    socket.disconnect();
    return response;
  }, token);
  expect(result.success).toBe(true);
  await expect(page.locator('#tvProtocolOverlay')).toHaveClass(/active/);
  await expect(page.locator('#protocolTitle')).toContainText('RUNDA 2');
  await page.screenshot({ path: 'artifacts/bunker-tv-protocol.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#tvProtocolOverlay')).not.toHaveClass(/active/);
  await page.locator('#tvEnableSound').click();
  const audio = await page.evaluate(async () => {
    const engine = new BunkerSoundEngine();
    engine.ctx = new OfflineAudioContext(1, 44100 * 9, 44100);
    engine.play('exile_stamp');
    const rendered = await engine.ctx.startRendering();
    const values = rendered.getChannelData(0);
    const late = values.slice(44100 * 4, 44100 * 6);
    const energy = late.reduce((total, value) => total + value * value, 0) / late.length;
    window.soundEngine.play('bunker_reveal');
    window.soundEngine.setMuted(true);
    return { energy, pending: window.soundEngine.sources.size };
  });
  expect(audio.energy).toBeGreaterThan(0.00000001);
  expect(audio.pending).toBe(0);
  expect(errors).toEqual([]);
});

test('speech buttons stop reliably, exile locks dossiers, and 4K cards use the screen', async ({
  page,
  context,
  request,
}) => {
  const token = (await (await request.post('/api/session', { data: {} })).json()).token;
  await request.post('/api/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { playerCount: 8 },
  });
  await page.goto('/');
  await expect(page.locator('.player-card')).toHaveCount(8);
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 3840, height: 2160 });
  await tv.goto('/tv');
  const first = page.locator('#player-card-1');
  await first.locator('.btn-speaker').click();
  await expect(first.locator('.btn-speaker')).toHaveClass(/speaking/);
  await expect(tv.locator('#tvProtocolOverlay')).toHaveClass(/active/);
  const started = Date.now();
  await expect(tv.locator('#tvProtocolOverlay')).not.toHaveClass(/active/, { timeout: 6000 });
  expect(Date.now() - started).toBeGreaterThan(3000);
  await first.locator('.btn-speaker').click();
  await expect(first.locator('.btn-speaker')).not.toHaveClass(/speaking/);
  await expect(tv.locator('#tvSpeakerBar')).not.toHaveClass(/active/);
  await expect(tv.locator('#tvProtocolOverlay')).not.toHaveClass(/active/);
  for (let i = 0; i < 3; i++) {
    await first.locator('.btn-speaker').click();
    await expect(first.locator('.btn-speaker')).toHaveClass(/speaking/);
    await page.locator('#btnStopSpeaker').click();
    await expect(first.locator('.btn-speaker')).not.toHaveClass(/speaking/);
    await expect(tv.locator('#tvSpeakerBar')).not.toHaveClass(/active/);
    await expect(tv.locator('#tvProtocolOverlay')).not.toHaveClass(/active/);
  }
  await first.locator('.slot-btn-add').first().click();
  await page.locator('.picker-card-item').first().click();
  await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
  await expect(tv.locator('#tvModalCardImg')).toHaveJSProperty('complete', true);
  await expect
    .poll(() => tv.locator('#tvModalCardImg').evaluate((img) => img.getBoundingClientRect().height))
    .toBeGreaterThan(1800);
  const geometry = await tv.locator('#tvModalCardImg').evaluate((img) => {
    const r = img.getBoundingClientRect();
    return { height: r.height, top: r.top, bottom: r.bottom, naturalWidth: img.naturalWidth };
  });
  expect(geometry.height).toBeGreaterThan(1700);
  expect(geometry.naturalWidth).toBeGreaterThan(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(2160);
  await tv.screenshot({ path: 'artifacts/bunker-tv-card-4k.png' });
  page.on('dialog', (dialog) => dialog.accept());
  await first.locator('.btn-exile-toggle').click();
  await expect(first).toHaveClass(/exiled/);
  for (const button of await first.locator('.slot-btn, .slot-btn-add').all())
    await expect(button).toBeDisabled();
  await expect(tv.locator('#tvCinematicModal')).not.toHaveClass(/active/);
  await first.locator('.btn-exile-toggle').click();
  await expect(first).not.toHaveClass(/exiled/);
  for (const button of await first.locator('.slot-btn, .slot-btn-add').all())
    await expect(button).toBeEnabled();
});

test('catastrophe and bunker stay on TV until the moderator stops the display', async ({
  page,
  context,
  request,
}) => {
  const token = (await (await request.post('/api/session', { data: {} })).json()).token;
  await request.post('/api/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { playerCount: 10 },
  });
  await page.goto('/');
  await expect(page.locator('.player-card')).toHaveCount(10);
  const tv = await context.newPage();
  await tv.clock.install();
  await tv.goto('/tv');
  await page.locator('[data-tab="tab-bunker"]').click();
  for (const scene of ['catastrofe', 'bunker']) {
    if (scene === 'catastrofe') await page.locator('#btnShowCatastropheOnTv').click();
    else await page.locator('.bunker-card-actions button').first().click();
    await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
    await expect(tv.locator('#tvCinematicModal')).toHaveAttribute('data-scene', scene);
    await tv.clock.fastForward(15000);
    await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
    await tv.keyboard.press('Escape');
    await tv.locator('#tvCinematicModal').click();
    await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
    await tv.reload();
    await expect(tv.locator('#tvCinematicModal')).toHaveClass(/active/);
    await expect(tv.locator('#tvCinematicModal')).toHaveAttribute('data-scene', scene);
    await page.locator('#btnStopTvDisplay').click();
    await expect(tv.locator('#tvCinematicModal')).not.toHaveClass(/active/);
    await expect(page.locator('#btnStopTvDisplay')).toBeDisabled();
    await tv.reload();
    await expect(tv.locator('#tvCinematicModal')).not.toHaveClass(/active/);
  }
});
