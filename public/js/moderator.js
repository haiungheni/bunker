// Moderator Console Application Logic
document.addEventListener('DOMContentLoaded', async () => {
  const socket = window.BunkerClient.create('moderator');
  const escapeHtml = window.BunkerClient.escapeHtml;
  let currentState = null;
  let activePickerTarget = null;
  let phaseDraft = null;

  // Sound Engine
  const sound = window.soundEngine;

  // Initialize Cards Database
  // The server supplies the catalog with init; bind all handlers before connecting.

  // Socket Events
  socket.on('init', ({ state, catalog, serverIps, port, canManageSessions }) => {
    window.CardsDB.data = catalog;
    window.CardsDB.isLoaded = true;
    syncState(state);
    if (activePickerTarget && cardCreateForm.hidden) renderPickerGrid();
    document.getElementById('btnRevokeModeratorSessions').hidden = !canManageSessions;
    setupTvUrls(serverIps, port);
  });

  socket.on('catalog:card_added', (card) => {
    window.CardsDB.data.cards.push(card);
    if (activePickerTarget && cardCreateForm.hidden) renderPickerGrid();
  });

  socket.on('game:state', syncState);

  socket.on('timer:tick', ({ timeLeft, duration, type, activeSpeakerId }) => {
    if (currentState && currentState.timer) {
      currentState.timer.timeLeft = timeLeft;
      currentState.timer.duration = duration;
      currentState.timer.isRunning = true;
      currentState.activeSpeakerId = activeSpeakerId;
    }
    updateTimerDisplay(timeLeft, duration);

    // Beep in last 5 seconds of speech timer
    if (timeLeft <= 5 && timeLeft > 0 && type === 'speech') {
      sound.play('tick');
    }
  });

  socket.on('timer:done', ({ type, activeSpeakerId }) => {
    if (currentState && currentState.timer) {
      currentState.timer.isRunning = false;
      currentState.timer.timeLeft = 0;
    }
    updateTimerDisplay(0, currentState ? currentState.timer.duration : 30);
    sound.play('gong');
  });

  socket.on('audio:play', ({ cue }) => {
    sound.play(cue);
  });

  socket.on('player:exiled_announcement', ({ player, round }) => {
    showToast(
      `🚨 JUCĂTOR EXILAT: ${player.name} a fost exclus din Buncăr în Runda ${round}!`,
      true,
    );
  });

  socket.on('game:reset_complete', (data) => {
    showToast(data.message || 'Jocul a fost resetat de la început!');
  });

  socket.on('toast:error', (data) => {
    showToast(data.message || 'Atenție!', true);
  });

  document.addEventListener('bunker:notice', (event) =>
    showToast(event.detail.message, event.detail.danger),
  );

  // Toast notification helper
  function showToast(message, isDanger = false) {
    const existing = document.querySelector('.mod-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `mod-toast ${isDanger ? 'toast-danger' : ''}`;
    toast.textContent = `${isDanger ? '☣️' : 'ℹ️'} ${message}`;
    toast.setAttribute('role', isDanger ? 'alert' : 'status');
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast && toast.parentNode) toast.remove();
    }, 4500);
  }

  // UI Element Selectors
  const headerRoundVal = document.getElementById('headerRoundVal');
  const headerPhaseVal = document.getElementById('headerPhaseVal');
  const headerBunkerVal = document.getElementById('headerBunkerVal');
  const tabPlayerCount = document.getElementById('tabPlayerCount');
  const playersContainer = document.getElementById('playersContainer');
  playersContainer.addEventListener('focusout', () => {
    setTimeout(() => {
      if (currentState && !playersContainer.contains(document.activeElement)) renderPlayers();
    }, 0);
  });
  const btnResetGame = document.getElementById('btnResetGame');
  const btnFinaleSaveReset = document.getElementById('btnFinaleSaveReset');
  const btnRosterAddPlayer = document.getElementById('btnRosterAddPlayer');
  const btnRosterRemovePlayer = document.getElementById('btnRosterRemovePlayer');
  const rosterCountBadge = document.getElementById('rosterCountBadge');
  const timerSpeakerText = document.getElementById('timerSpeakerText');
  const timerDisplay = document.getElementById('timerDisplay');
  const btnTimerToggle = document.getElementById('btnTimerToggle');
  const btnTimerAdd15 = document.getElementById('btnTimerAdd15');
  const btnTimerReset = document.getElementById('btnTimerReset');
  const btnTimer30 = document.getElementById('btnTimer30');
  const btnTimer60 = document.getElementById('btnTimer60');
  const btnStopSpeaker = document.getElementById('btnStopSpeaker');
  const btnNextSpeaker = document.getElementById('btnNextSpeaker');

  const selectRound = document.getElementById('selectRound');
  const selectPhase = document.getElementById('selectPhase');
  const btnApplyPhase = document.getElementById('btnApplyPhase');
  const btnNextRound = document.getElementById('btnNextRound');

  // Modals
  const cardPickerModal = document.getElementById('cardPickerModal');
  const btnCloseCardPicker = document.getElementById('btnCloseCardPicker');
  const btnCancelCardPicker = document.getElementById('btnCancelCardPicker');
  const cardSearchInput = document.getElementById('cardSearchInput');
  const cardCategoryFilter = document.getElementById('cardCategoryFilter');
  const cardPickerGrid = document.getElementById('cardPickerGrid');
  const cardPickerTitle = document.getElementById('cardPickerTitle');
  const cardPickerSubtitle = document.getElementById('cardPickerSubtitle');
  const cardCreatePrompt = document.getElementById('cardPickerCreatePrompt');
  const cardCreateForm = document.getElementById('cardCreateForm');
  const cardCreateTitle = document.getElementById('cardCreateTitle');
  const cardCreateDescription = document.getElementById('cardCreateDescription');
  const btnSaveCardCreate = document.getElementById('btnSaveCardCreate');
  const checkShowOnTv = document.getElementById('checkShowOnTv');

  const gameSetupModal = document.getElementById('gameSetupModal');
  const btnGameSetup = document.getElementById('btnGameSetup');
  const btnCloseSetup = document.getElementById('btnCloseSetup');
  const btnCancelSetup = document.getElementById('btnCancelSetup');
  const btnSaveSetup = document.getElementById('btnSaveSetup');
  const inputPlayerCount = document.getElementById('inputPlayerCount');
  const playerNamesSetupGrid = document.getElementById('playerNamesSetupGrid');

  const soundFxModal = document.getElementById('soundFxModal');
  const btnSoundFx = document.getElementById('btnSoundFx');
  const btnCloseSoundFx = document.getElementById('btnCloseSoundFx');
  const btnAudioMute = document.getElementById('btnAudioMute');
  const audioIcon = document.getElementById('audioIcon');

  // Tab Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      navTabs.forEach((t) => t.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });

  // Category Configuration
  const CATEGORIES = [
    { slug: 'profesie', name: 'Profesie', icon: '💼', color: '#f59e0b' },
    { slug: 'biologie', name: 'Biologie', icon: '👤', color: '#ec4899' },
    { slug: 'sanatate', name: 'Sănătate', icon: '❤️', color: '#ef4444' },
    { slug: 'hobby', name: 'Hobby', icon: '🏆', color: '#10b981' },
    { slug: 'bagaj', name: 'Bagaj', icon: '🎒', color: '#3b82f6' },
    { slug: 'fapte', name: 'Informație', icon: '📜', color: '#8b5cf6' },
    { slug: 'conditii_speciale', name: 'Condiție Spec.', icon: '✨', color: '#f97316' },
  ];

  const PHASE_NAMES = {
    bunker_reveal: 'Cercetare Buncăr',
    card_reveal: 'Dezvăluire Cărți',
    discussion: 'Discuție Vot (60s)',
    voting: 'Votare Secretă',
    tiebreak: 'Balotaj (Egalitate)',
    round_end: 'Sfârșit Rundă',
    finale: 'Faza Finală (Epilog)',
  };

  function syncState(state) {
    if (currentState && currentState.gameId !== state.gameId) {
      closeCardPicker();
      gameSetupModal.classList.remove('active');
      quickScheduleModal.classList.remove('active');
      phaseDraft = null;
    }
    if (currentState?.round !== state.round || currentState?.phase !== state.phase) phaseDraft = null;
    currentState = state;
    renderAll();
  }

  // Main Render Function
  function renderAll() {
    if (!currentState) return;
    if (
      activePickerTarget?.playerId != null &&
      currentState.players.find((p) => p.id === activePickerTarget.playerId)?.status !== 'alive'
    ) {
      closeCardPicker();
    }

    renderHeader();
    document.getElementById('btnStopTvDisplay').disabled = !currentState.cardModal;
    renderTimer();
    if (
      !playersContainer.contains(document.activeElement) ||
      !document.activeElement.matches('.player-name-input')
    )
      renderPlayers();
    renderBunkerTab();
    renderVotingTab();
    renderTvControls();
    renderFinaleTab();
    document.getElementById('btnUndo').disabled = !currentState.canUndo;
    document.getElementById('saveStatus').textContent = currentState.saveError
      ? 'Salvare eșuată • verifică discul'
      : 'Partidă salvată';
  }

  // Render Header
  function renderHeader() {
    headerRoundVal.textContent = `${currentState.round} / ${currentState.totalRounds || 5}`;
    headerPhaseVal.textContent = PHASE_NAMES[currentState.phase] || currentState.phase;

    const aliveCount = currentState.players.filter((p) => p.status === 'alive').length;
    headerBunkerVal.textContent = `${currentState.bunkerCapacity} locuri / ${aliveCount} rămași`;
    tabPlayerCount.textContent = currentState.players.length;

    if (!phaseDraft) {
      selectRound.value = currentState.round;
      selectPhase.value = currentState.phase;
    }
  }

  // Render Timer Bar
  function renderTimer() {
    const timer = currentState.timer || { timeLeft: 30, duration: 30, isRunning: false };
    updateTimerDisplay(timer.timeLeft, timer.duration);

    if (currentState.activeSpeakerId) {
      const speaker = currentState.players.find((p) => p.id === currentState.activeSpeakerId);
      timerSpeakerText.textContent = speaker ? `${speaker.name} este la cuvânt` : 'Vorbitor activ';
    } else {
      timerSpeakerText.textContent = timer.type === 'speech' && timer.timeLeft === 0
        ? 'Timp expirat'
        : 'Niciun vorbitor selectat';
    }

    btnTimerToggle.textContent = timer.isRunning ? '⏸' : '▶';
    btnNextSpeaker.disabled =
      currentState.phase === 'finale' || ['collecting', 'result', 'defense'].includes(currentState.voteSession?.stage) ||
      !currentState.players.some((p) => p.status === 'alive' && p.id !== currentState.activeSpeakerId);
  }

  function updateTimerDisplay(seconds, duration) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (seconds <= 5 && seconds > 0) {
      timerDisplay.classList.add('danger');
    } else {
      timerDisplay.classList.remove('danger');
    }
  }

  // Render Players
  function renderPlayers() {
    playersContainer.innerHTML = '';

    if (rosterCountBadge && currentState.players) {
      rosterCountBadge.textContent = `${currentState.players.length} Jucători în joc`;
    }

    currentState.players.forEach((player) => {
      const cardEl = document.createElement('div');
      cardEl.className = `player-card ${player.status === 'exiled' ? 'exiled' : ''} ${currentState.activeSpeakerId === player.id ? 'active-speaker' : ''}`;
      cardEl.id = `player-card-${player.id}`;

      // Header
      const header = document.createElement('div');
      header.className = 'player-header';

      const titleBox = document.createElement('div');
      titleBox.className = 'player-title-box';

      const numBadge = document.createElement('span');
      numBadge.className = 'player-num-badge';
      numBadge.textContent = player.seat || player.id;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'player-name-input';
      nameInput.value = player.name;
      nameInput.title = 'Click pentru a modifica numele jucătorului';
      nameInput.addEventListener('change', (e) => {
        socket.emit('player:rename', { playerId: player.id, name: e.target.value });
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.target.blur();
      });

      titleBox.appendChild(numBadge);
      titleBox.appendChild(nameInput);

      if (player.status === 'exiled') {
        const exiledBadge = document.createElement('span');
        exiledBadge.className = 'badge badge-red';
        exiledBadge.textContent = 'EXILAT';
        titleBox.appendChild(exiledBadge);
      }

      // Actions in Header
      const actionsBox = document.createElement('div');
      actionsBox.className = 'player-header-actions';

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-delete-player';
      btnDelete.innerHTML = '🗑️';
      btnDelete.title = `Șterge ${player.name} din joc`;
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Ești sigur că vrei să elimini ${player.name} din lista de jucători?`)) {
          socket.emit('player:remove', { playerId: player.id });
        }
      });
      actionsBox.appendChild(btnDelete);

      if (player.status === 'alive') {
        const isSpeaking = currentState.activeSpeakerId === player.id;
        const btnSpeak = document.createElement('button');
        btnSpeak.className = `btn-speaker ${isSpeaking ? 'speaking' : ''}`;
        btnSpeak.innerHTML = `<span>🎙️</span> ${isSpeaking ? 'La cuvânt' : 'Dă cuvântul'}`;
        btnSpeak.addEventListener('click', () => {
          if (currentState.activeSpeakerId === player.id) {
            socket.emit('speaker:set', { playerId: null });
          } else {
            socket.emit('speaker:set', { playerId: player.id, autoStartTimer: true });
          }
        });
        actionsBox.appendChild(btnSpeak);
      }

      const btnExile = document.createElement('button');
      btnExile.className = `btn-exile-toggle ${player.status === 'alive' ? 'action-exile' : 'action-readmit'}`;
      btnExile.textContent = player.status === 'alive' ? '🚪 Exilare manuală' : '↶ Readu în joc';
      btnExile.title =
        player.status === 'alive' ? 'Exilează acest jucător' : 'Readu jucătorul în joc';
      btnExile.addEventListener('click', () => {
        if (confirm(`Ești sigur că vrei să schimbi statusul pentru ${player.name}?`)) {
          socket.emit('player:toggle_exile', { playerId: player.id });
        }
      });

      header.appendChild(titleBox);
      header.appendChild(actionsBox);
      cardEl.appendChild(header);
      const footerActions = document.createElement('div');
      footerActions.className = 'player-manual-actions';
      const actionHint = document.createElement('span');
      actionHint.textContent =
        player.status === 'alive'
          ? 'Decizia moderatorului'
          : `Exilat în runda ${player.exiledInRound}`;
      footerActions.append(actionHint, btnExile);

      // Slots
      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'player-slots';

      CATEGORIES.forEach((cat) => {
        const revealedCard = player.cards[cat.slug];
        const slotEl = document.createElement('div');
        slotEl.className = `card-slot cat-${cat.slug} ${revealedCard ? 'revealed' : 'empty'}`;

        const catTag = document.createElement('div');
        catTag.className = 'slot-category-tag';
        catTag.innerHTML = `<span>${cat.icon}</span> <span>${cat.name}</span>`;
        slotEl.appendChild(catTag);

        if (revealedCard) {
          const content = document.createElement('div');
          content.className = 'slot-content-revealed';

          if (revealedCard.image) {
            const img = document.createElement('img');
            img.className = 'slot-thumb';
            img.src = revealedCard.image;
            img.alt = revealedCard.title;
            img.loading = 'lazy';
            content.appendChild(img);
          }

          const title = document.createElement('span');
          title.className = 'slot-title';
          title.textContent = revealedCard.title;
          title.title = revealedCard.title;

          content.appendChild(title);
          slotEl.appendChild(content);

          const actions = document.createElement('div');
          actions.className = 'slot-actions';

          // Show on TV button
          const btnShowTv = document.createElement('button');
          btnShowTv.className = 'slot-btn';
          btnShowTv.innerHTML = '📺';
          btnShowTv.title = 'Afișează pe tot ecranul TV';
          btnShowTv.disabled = player.status === 'exiled';
          btnShowTv.addEventListener('click', () => {
            socket.emit('modal:show', {
              cardId: revealedCard.id,
              playerId: player.id,
              category: cat.slug,
            });
            sound.play('card_reveal');
          });

          // Replace/Change
          const btnEdit = document.createElement('button');
          btnEdit.className = 'slot-btn';
          btnEdit.innerHTML = '✎';
          btnEdit.title = 'Schimbă cartea';
          btnEdit.disabled = player.status === 'exiled';
          btnEdit.addEventListener('click', () => {
            openCardPicker(player.id, cat.slug);
          });

          // Remove
          const btnRemove = document.createElement('button');
          btnRemove.className = 'slot-btn';
          btnRemove.innerHTML = '✕';
          btnRemove.title = 'Ascunde / Șterge';
          btnRemove.disabled = player.status === 'exiled';
          btnRemove.addEventListener('click', () => {
            socket.emit('player:unreveal_card', { playerId: player.id, category: cat.slug });
          });

          actions.appendChild(btnShowTv);
          actions.appendChild(btnEdit);
          actions.appendChild(btnRemove);
          slotEl.appendChild(actions);
        } else {
          // Empty slot button
          const btnAdd = document.createElement('button');
          btnAdd.className = 'slot-btn-add';
          btnAdd.textContent = '+ Deschide Carte';
          btnAdd.disabled = player.status === 'exiled';
          btnAdd.addEventListener('click', () => {
            openCardPicker(player.id, cat.slug);
          });
          slotEl.appendChild(btnAdd);
        }

        slotsContainer.appendChild(slotEl);
      });

      cardEl.appendChild(slotsContainer);
      cardEl.appendChild(footerActions);
      playersContainer.appendChild(cardEl);
    });
  }

  // Render Bunker & Catastrophe
  function renderBunkerTab() {
    const catContent = document.getElementById('catastropheContent');
    const cat = currentState.catastrophe;

    if (cat) {
      catContent.innerHTML = `
        ${cat.image ? `<div class="catastrophe-image-wrap">
          <img src="${escapeHtml(cat.image)}" alt="${escapeHtml(cat.title)}" class="catastrophe-img">
        </div>` : ''}
        <div class="catastrophe-details">
          <span class="badge badge-red">CATASTROFĂ PLANETARĂ</span>
          <div class="catastrophe-name">${escapeHtml(cat.title)}</div>
          <div class="catastrophe-desc">${escapeHtml(cat.description || '')}</div>
        </div>
      `;
    } else {
      catContent.innerHTML = '<p class="text-dim">Nicio catastrofă selectată.</p>';
    }

    // Bunker cards
    const bunkerGrid = document.getElementById('bunkerDeckGrid');
    bunkerGrid.innerHTML = '';

    (currentState.bunkerCards || []).forEach((bCard, idx) => {
      const cardEl = document.createElement('div');
      cardEl.className = `bunker-round-card ${bCard.revealed ? 'revealed' : ''}`;

      cardEl.innerHTML = `
        <div class="bunker-card-header">
          <span class="badge ${bCard.revealed ? 'badge-cyan' : 'badge-gold'}">Runda ${idx + 1}</span>
          ${bCard.revealed ? '<span class="badge badge-emerald">Dezvăluită</span>' : '<span class="badge badge-red">Ascunsă</span>'}
        </div>
        <div class="bunker-card-thumb-wrap">
          <img src="${escapeHtml(bCard.image)}" alt="${escapeHtml(bCard.title)}" class="bunker-card-thumb" style="${bCard.revealed ? '' : 'filter: blur(10px) brightness(0.4);'}">
        </div>
        <div class="bunker-card-info">
          <div class="bunker-card-title">${bCard.revealed ? escapeHtml(bCard.title) : 'Modul Buncăr Nedescoperit'}</div>
          <div class="bunker-card-desc">${bCard.revealed ? escapeHtml(bCard.description || '') : 'Se cercetează la începutul rundei.'}</div>
        </div>
        <div class="bunker-card-actions" style="margin-top:auto; padding-top:8px;">
          ${
            !bCard.revealed
              ? `
            <button class="btn btn-primary btn-sm" style="width:100%" onclick="window.revealBunker(${idx})">
              🔍 Cercetează & Arată pe TV
            </button>
          `
              : `
            <button class="btn btn-secondary btn-sm" style="width:100%" onclick="window.showBunkerTv(${idx})">
              📺 Afișează pe TV
            </button>
          `
          }
        </div>
      `;
      bunkerGrid.appendChild(cardEl);
    });
  }

  window.revealBunker = (idx) => {
    socket.emit('bunker:reveal', { index: idx });
  };

  window.showBunkerTv = (idx) => {
    const card = currentState.bunkerCards[idx];
    if (card) {
      socket.emit('modal:show', { cardId: card.id, category: 'bunker' });
    }
  };

  // Render Voting Tab
  function renderVotingTab() {
    const roundNum = document.getElementById('votingRoundNum');
    const scheduleHint = document.getElementById('votingScheduleText');
    roundNum.textContent = currentState.round;

    const roundVotesSchedule = currentState.exileSchedule ||
      currentState.votingSchedule || [0, 1, 1, 1, 1];
    const votesThisRound = roundVotesSchedule[currentState.round - 1] || 0;

    // Update banner summary
    const planSummaryEl = document.getElementById('votingScheduleSummaryText');
    if (planSummaryEl) {
      planSummaryEl.textContent = `R1: ${roundVotesSchedule[0]} | R2: ${roundVotesSchedule[1]} | R3: ${roundVotesSchedule[2]} | R4: ${roundVotesSchedule[3]} | R5: ${roundVotesSchedule[4]}`;
    }

    const quotaBadge = document.getElementById('roundExileQuotaBadge');
    if (quotaBadge) {
      quotaBadge.textContent = `Excluderi prevăzute în runda ${currentState.round}: ${votesThisRound}`;
      quotaBadge.className = votesThisRound > 0 ? 'badge badge-gold' : 'badge badge-cyan';
    }

    if (votesThisRound === 0) {
      scheduleHint.textContent = `ℹ️ În Runda ${currentState.round}, conform planului stabilit, NU se exclud jucători (doar se prezintă cărțile).`;
    } else if (votesThisRound === 1) {
      scheduleHint.textContent = `⚖️ În Runda ${currentState.round}: conform planului, 1 jucător va fi exilat prin vot.`;
    } else {
      scheduleHint.textContent = `⚖️ În Runda ${currentState.round}: conform planului, ${votesThisRound} jucători vor fi exilați prin vot!`;
    }

    const grid = document.getElementById('votingCandidatesGrid');
    const focusedVote = grid.contains(document.activeElement) && document.activeElement.dataset.vote;
    grid.innerHTML = '';

    const session = currentState.voteSession || { stage: 'idle', candidates: [] };
    const alivePlayers = currentState.players.filter(
      (p) =>
        p.status === 'alive' && (!session.candidates.length || session.candidates.includes(p.id)),
    );
    const done = window.BunkerRules.exilesInRound(currentState);
    document.getElementById('voteSessionStatus').textContent =
      `${session.candidates.length ? 'Balotaj • ' : ''}${{ idle: 'Pregătire', collecting: 'Votare deschisă', result: 'Rezultat confirmabil', defense: 'Apărarea candidaților' }[session.stage] || session.stage} • ${done} / ${votesThisRound} exilări în rundă`;
    document.getElementById('btnCloseVoting').disabled = session.stage !== 'collecting';
    document.getElementById('btnResetVoteCounts').disabled = !window.BunkerRules.showVoteTally(currentState);
    document.getElementById('btnStartVoting').textContent = session.candidates.length
      ? 'Pornește votul de departajare'
      : 'Pornește un vot nou';
    document.getElementById('btnStartVoting').disabled = session.stage === 'collecting';
    let maxVotes = 0;
    let topCandidates = [];

    alivePlayers.forEach((p) => {
      const votes = p.votes || 0;
      if (votes > maxVotes) {
        maxVotes = votes;
        topCandidates = [p];
      } else if (votes === maxVotes && votes > 0) {
        topCandidates.push(p);
      }
    });
    document.getElementById('btnTiebreakTimer').disabled = session.stage !== 'result' || topCandidates.length < 2;

    alivePlayers.forEach((p) => {
      const box = document.createElement('div');
      const isTop = topCandidates.some((c) => c.id === p.id) && maxVotes > 0;
      box.className = `candidate-box ${isTop ? 'top-voted' : ''}`;

      const prof = p.cards.profesie ? p.cards.profesie.title : 'Profesie necunoscută';

      box.innerHTML = `
        <div class="candidate-info">
          <span class="candidate-name">${escapeHtml(p.name)} (#${p.seat || p.id})</span>
          <span class="candidate-prof">${escapeHtml(prof)}</span>
        </div>
        <div class="vote-counter-wrap">
          <button class="vote-btn" data-vote="${p.id}:-1" aria-label="Scade un vot pentru ${escapeHtml(p.name)}" ${session.stage !== 'collecting' ? 'disabled' : ''}>−</button>
          <span class="vote-count-num">${p.votes || 0}</span>
          <button class="vote-btn" data-vote="${p.id}:1" aria-label="Adaugă un vot pentru ${escapeHtml(p.name)}" ${session.stage !== 'collecting' ? 'disabled' : ''}>+</button>
        </div>
      `;
      grid.appendChild(box);
    });
    if (focusedVote) grid.querySelector(`[data-vote="${focusedVote}"]:enabled`)?.focus({ preventScroll: true });

    // Summary bar
    const topSummary = document.getElementById('topVotedCandidate');
    const btnExileTop = document.getElementById('btnExileTopCandidate');

    if (maxVotes === 0) {
      topSummary.textContent = 'Niciun vot acordat încă.';
      btnExileTop.disabled = true;
    } else if (topCandidates.length === 1) {
      topSummary.textContent = `${topCandidates[0].name} (${maxVotes} voturi)`;
      btnExileTop.disabled = session.stage !== 'result';
      btnExileTop.onclick = () => {
        if (confirm(`Confirmi exilarea jucătorului ${topCandidates[0].name}?`)) {
          socket.emit('votes:exile', { playerId: topCandidates[0].id });
        }
      };
    } else {
      topSummary.textContent = `BALOTAJ (Egalitate): ${topCandidates.map((c) => c.name).join(', ')} (${maxVotes} voturi)`;
      btnExileTop.disabled = true;
    }
  }

  document.getElementById('votingCandidatesGrid').addEventListener('click', (event) => {
    const vote = event.target.closest('button[data-vote]');
    if (!vote) return;
    const [playerId, delta] = vote.dataset.vote.split(':').map(Number);
    socket.emit('votes:adjust', { playerId, delta });
  });

  // Render Finale Tab
  function renderFinaleTab() {
    const survivorsList = document.getElementById('bunkerSurvivorsList');
    const exiledList = document.getElementById('exiledPlayersList');
    const reproCheck = document.getElementById('reproductionCheckResult');

    survivorsList.innerHTML = '';
    exiledList.innerHTML = '';

    const alive = currentState.players.filter((p) => p.status === 'alive');
    const exiled = currentState.players.filter((p) => p.status === 'exiled');

    document.getElementById('survivorsCountBadge').textContent = `${alive.length} Jucători`;
    document.getElementById('exiledCountBadge').textContent = `${exiled.length} Jucători`;

    alive.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'candidate-box';
      const prof = p.cards.profesie ? p.cards.profesie.title : 'Fără profesie';
      const bio = p.cards.biologie ? p.cards.biologie.title : 'Biologie necunoscută';
      const san = p.cards.sanatate ? p.cards.sanatate.title : 'Sănătate necunoscută';

      item.innerHTML = `
        <div class="candidate-info">
          <span class="candidate-name">${escapeHtml(p.name)}</span>
          <span class="candidate-prof">${escapeHtml(prof)} • ${escapeHtml(bio)} • ${escapeHtml(san)}</span>
        </div>
      `;
      survivorsList.appendChild(item);
    });

    exiled.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'candidate-box';
      const prof = p.cards.profesie ? p.cards.profesie.title : 'Fără profesie';
      item.innerHTML = `
        <div class="candidate-info">
          <span class="candidate-name" style="text-decoration:line-through; color:var(--accent-red);">${escapeHtml(p.name)}</span>
          <span class="candidate-prof">${escapeHtml(prof)}</span>
        </div>
      `;
      exiledList.appendChild(item);
    });

    const outcome = window.BunkerRules.reproduction(currentState);
    const atCapacity = alive.length === currentState.bunkerCapacity;
    let message = !atCapacity
      ? 'Partida nu este încheiată: numărul supraviețuitorilor diferă de capacitatea buncărului.'
      : 'Scop Salvare: grupul selectat pentru buncăr este complet. Moderatorul stabilește epilogul.';
    if (atCapacity && currentState.goal === 'renastere')
      message = {
        met: 'Condiția Renaștere este îndeplinită conform datelor cărților.',
        unmet: 'Condiția Renaștere nu este îndeplinită conform datelor cărților.',
        unknown:
          'Informații insuficiente: moderatorul verifică aptitudinea de reproducere pe cărțile fizice.',
      }[outcome];
    reproCheck.textContent = message;
    reproCheck.className = 'finale-outcome';
    document.getElementById('btnDrawThreat').disabled =
      currentState.mode !== 'survival' || currentState.phase !== 'finale';

    // Threats list
    const threatsList = document.getElementById('threatsList');
    threatsList.innerHTML = '';
    (currentState.revealedThreats || []).forEach((t) => {
      const tEl = document.createElement('div');
      tEl.className = 'candidate-box';
      tEl.style.borderColor = 'var(--accent-purple)';
      tEl.innerHTML = `
        <div class="candidate-info">
          <span class="candidate-name" style="color:var(--accent-purple)">⚠️ ${escapeHtml(t.title)}</span>
          <span class="candidate-prof">${escapeHtml(t.description)}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.showThreatOnTv('${t.id}')">📺 Pe TV</button>
      `;
      threatsList.appendChild(tEl);
    });
  }

  window.showThreatOnTv = (threatId) => {
    socket.emit('modal:show', { cardId: threatId, category: 'amenintare' });
  };

  // Timer Controls
  btnTimerToggle.addEventListener('click', () => {
    if (currentState && currentState.timer && currentState.timer.isRunning) {
      socket.emit('timer:control', { action: 'pause' });
    } else {
      socket.emit('timer:control', { action: 'start' });
    }
  });

  btnTimerAdd15.addEventListener('click', () => {
    socket.emit('timer:control', { action: 'add', addSeconds: 15 });
  });

  btnTimerReset.addEventListener('click', () => {
    socket.emit('timer:control', { action: 'reset' });
  });

  btnTimer30.addEventListener('click', () => {
    socket.emit('timer:control', { action: 'set', duration: 30, type: 'speech' });
  });

  btnTimer60.addEventListener('click', () => {
    socket.emit('timer:control', { action: 'set', duration: 60, type: 'discussion' });
  });

  btnStopSpeaker.addEventListener('click', () => {
    socket.emit('speaker:set', { playerId: null });
  });
  btnNextSpeaker.addEventListener('click', () => socket.emit('speaker:next'));
  document.getElementById('btnStopTvDisplay').addEventListener('click', () => {
    socket.emit('modal:close');
  });

  // Phase Controls
  for (const select of [selectRound, selectPhase]) {
    select.addEventListener('change', () => {
      if (currentState && !phaseDraft)
        phaseDraft = { fromRound: currentState.round, fromPhase: currentState.phase };
    });
  }
  btnApplyPhase.addEventListener('click', () => {
    const r = parseInt(selectRound.value, 10);
    const p = selectPhase.value;
    socket.emit('game:set_phase', { round: r, phase: p, ...phaseDraft }, (result) => {
      if (result.success) {
        phaseDraft = null;
        renderHeader();
      }
    });
  });

  btnNextRound.addEventListener('click', () => {
    if (currentState.round < 5) {
      socket.emit('game:set_phase', { round: currentState.round + 1, phase: 'bunker_reveal' });
    } else {
      socket.emit('game:set_phase', { round: 5, phase: 'finale' });
    }
  });

  // Catastrophe actions
  document.getElementById('btnShowCatastropheOnTv').addEventListener('click', () => {
    if (currentState.catastrophe) {
      socket.emit('modal:show', { cardId: currentState.catastrophe.id, category: 'catastrofe' });
    }
  });

  document.getElementById('btnRandomCatastrophe').addEventListener('click', () => {
    socket.emit('catastrophe:select', { isRandom: true });
  });

  document.getElementById('btnChangeCatastrophe').addEventListener('click', () => {
    openCardPicker(null, 'catastrofe');
  });

  // Voting actions
  document.getElementById('btnStartVoteDiscussion').addEventListener('click', () => {
    socket.emit('game:set_phase', { phase: 'discussion' });
  });

  document.getElementById('btnResetVoteCounts').addEventListener('click', () => {
    socket.emit('votes:record', { votes: {} });
  });
  document.getElementById('btnShowVotingOnTv').addEventListener('click', () => {
    socket.emit('tv:display', { mode: 'votes' });
  });

  document.getElementById('btnTiebreakTimer').addEventListener('click', () => {
    socket.emit('votes:tiebreak');
  });

  // Threat Draw in Finale
  document.getElementById('btnDrawThreat').addEventListener('click', () => {
    socket.emit('threat:draw');
  });

  // Audio Controls & Sound FX Modal
  btnAudioMute.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    audioIcon.textContent = sound.muted ? '🔇' : '🔊';
  });

  btnSoundFx.addEventListener('click', () => {
    soundFxModal.classList.add('active');
  });

  btnCloseSoundFx.addEventListener('click', () => {
    soundFxModal.classList.remove('active');
  });

  document.querySelectorAll('.sound-card-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cue = btn.dataset.cue;
      socket.emit('audio:trigger', { cue });
    });
  });

  // Card Picker Logic
  function openCardPicker(playerId, categorySlug) {
    if (playerId != null && currentState.players.find((p) => p.id === playerId)?.status !== 'alive')
      return;
    activePickerTarget = { gameId: currentState.gameId, playerId, category: categorySlug };

    const player = playerId ? currentState.players.find((p) => p.id === playerId) : null;
    const catInfo = window.CardsDB.getCategoryInfo(categorySlug);

    cardPickerTitle.textContent = `Alege ${catInfo.name}`;
    cardPickerSubtitle.textContent = player
      ? `pentru ${player.name} (#${player.id})`
      : 'pentru Buncăr / Joc';

    cardCategoryFilter.value = categorySlug || 'all';
    cardCategoryFilter.disabled = !!categorySlug;
    cardSearchInput.value = '';

    cardPickerModal.inert = false;
    cardPickerModal.classList.add('active');
    showPickerCreation(false);
  }

  function closeCardPicker() {
    cardPickerModal.inert = true;
    cardPickerModal.classList.remove('active');
    activePickerTarget = null;
  }

  function showPickerCreation(open) {
    cardCreateForm.hidden = !open;
    cardPickerGrid.hidden = open;
    cardCreatePrompt.hidden = open;
    cardSearchInput.disabled = open;
    if (open) {
      cardCreateForm.reset();
      btnSaveCardCreate.disabled = false;
      cardCreateTitle.value = cardSearchInput.value.trim();
      cardCreateTitle.focus();
    } else {
      renderPickerGrid();
      cardSearchInput.focus();
    }
  }

  btnCloseCardPicker.addEventListener('click', closeCardPicker);
  btnCancelCardPicker.addEventListener('click', closeCardPicker);
  document.getElementById('btnOpenCardCreate').onclick = () => showPickerCreation(true);
  document.getElementById('btnCancelCardCreate').onclick = () => showPickerCreation(false);
  cardCreateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const target = activePickerTarget;
    if (!target || btnSaveCardCreate.disabled) return;
    const title = cardCreateTitle.value.trim();
    if (!title) {
      showToast('Introdu titlul cartonașului.', true);
      cardCreateTitle.focus();
      return;
    }
    btnSaveCardCreate.disabled = true;
    socket.emit(
      'catalog:create',
      {
        ...target,
        title,
        description: cardCreateDescription.value.trim(),
        showOnTv: checkShowOnTv.checked,
      },
      (result) => {
        if (activePickerTarget !== target) return;
        btnSaveCardCreate.disabled = false;
        if (result.success) {
          closeCardPicker();
          if (result.saved) showToast('Cartonașul a fost adăugat în catalog.');
        }
      },
    );
  });

  cardSearchInput.addEventListener('input', () => {
    renderPickerGrid();
  });

  cardCategoryFilter.addEventListener('change', () => {
    renderPickerGrid();
  });

  function renderPickerGrid() {
    const q = cardSearchInput.value;
    const cat = cardCategoryFilter.value === 'all' ? null : cardCategoryFilter.value;
    const results = window.CardsDB.search(q, cat);
    const normalizedQuery = window.BunkerRules.normalize(q.trim());
    cardCreatePrompt.hidden =
      !activePickerTarget?.category ||
      !normalizedQuery ||
      results.some((card) => window.BunkerRules.normalize(card.title) === normalizedQuery);

    cardPickerGrid.innerHTML = '';

    if (results.length === 0) {
      cardPickerGrid.innerHTML = '<p class="card-picker-empty">Niciun cartonaș găsit.</p>';
      return;
    }

    results.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'picker-card-item';
      item.addEventListener('click', () => {
        selectCardForTarget(c);
      });

      item.innerHTML = `
        ${c.image ? `<img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}" class="picker-card-img" loading="lazy">` : ''}
        <div class="picker-card-info">
          <span class="picker-card-cat cat-${c.category}">${escapeHtml(c.categoryRo)}</span>
          <span class="picker-card-title">${escapeHtml(c.title)}</span>
        </div>
      `;
      cardPickerGrid.appendChild(item);
    });
  }

  function selectCardForTarget(card) {
    if (!activePickerTarget) return;

    const showOnTv = checkShowOnTv.checked;

    if (activePickerTarget.playerId) {
      socket.emit('player:reveal_card', {
        gameId: activePickerTarget.gameId,
        playerId: activePickerTarget.playerId,
        category: activePickerTarget.category,
        cardId: card.id,
        showOnTv: showOnTv,
      });
    } else if (activePickerTarget.category === 'catastrofe') {
      socket.emit('catastrophe:select', { gameId: activePickerTarget.gameId, cardId: card.id });
    }

    closeCardPicker();
  }

  // Helper: auto schedule by player count
  function getAutoScheduleForCount(pCount) {
    return window.BunkerRules.schedule(pCount);
  }

  function setScheduleInputs(prefix, schedule, pCount) {
    for (let r = 1; r <= 5; r++) {
      const input = document.getElementById(`${prefix ? prefix + 'ExileR' : 'exileR'}${r}`);
      if (input) input.value = schedule[r - 1] !== undefined ? schedule[r - 1] : 1;
    }
    updateScheduleSummaryBadges(prefix, pCount);
  }

  function getScheduleFromInputs(prefix) {
    const s = [];
    for (let r = 1; r <= 5; r++) {
      const input = document.getElementById(`${prefix ? prefix + 'ExileR' : 'exileR'}${r}`);
      s.push(Math.max(0, parseInt(input ? input.value : 0, 10) || 0));
    }
    return s;
  }

  function updateScheduleSummaryBadges(prefix, pCount) {
    const s = getScheduleFromInputs(prefix);
    const totalExiles = s.reduce((a, b) => a + b, 0);
    const cap = Math.max(1, pCount - totalExiles);

    const badgeTotal = document.getElementById(
      prefix === '' ? 'badgeTotalExiles' : `${prefix}BadgeTotalExiles`,
    );
    const badgeCap = document.getElementById(
      prefix === '' ? 'badgeBunkerCap' : `${prefix}BadgeBunkerCap`,
    );

    if (badgeTotal) badgeTotal.textContent = `Total Exilați: ${totalExiles}`;
    if (badgeCap) badgeCap.textContent = `Locuri în Buncăr: ${cap}`;
  }

  // Attach live recalculation to schedule inputs
  ['', 'quick'].forEach((prefix) => {
    for (let r = 1; r <= 5; r++) {
      const input = document.getElementById(`${prefix ? prefix + 'ExileR' : 'exileR'}${r}`);
      if (input) {
        input.addEventListener('input', () => {
          const count =
            parseInt(inputPlayerCount.value, 10) || (currentState ? currentState.playerCount : 8);
          updateScheduleSummaryBadges(prefix, count);
        });
      }
    }
  });

  const btnAutoCalcSchedule = document.getElementById('btnAutoCalcSchedule');
  if (btnAutoCalcSchedule) {
    btnAutoCalcSchedule.addEventListener('click', () => {
      const count = Math.max(4, Math.min(22, parseInt(inputPlayerCount.value, 10) || 8));
      const auto = getAutoScheduleForCount(count);
      setScheduleInputs('', auto, count);
    });
  }

  // Quick Schedule Modal Logic
  const quickScheduleModal = document.getElementById('quickScheduleModal');
  const btnOpenScheduleQuickEdit = document.getElementById('btnOpenScheduleQuickEdit');
  const btnCloseQuickSchedule = document.getElementById('btnCloseQuickSchedule');
  const btnCancelQuickSchedule = document.getElementById('btnCancelQuickSchedule');
  const btnSaveQuickSchedule = document.getElementById('btnSaveQuickSchedule');

  if (btnOpenScheduleQuickEdit) {
    btnOpenScheduleQuickEdit.addEventListener('click', () => {
      const current = currentState.exileSchedule || currentState.votingSchedule || [0, 1, 1, 1, 1];
      setScheduleInputs('quick', current, currentState.playerCount);
      quickScheduleModal.classList.add('active');
    });
  }

  if (btnCloseQuickSchedule) {
    btnCloseQuickSchedule.addEventListener('click', () => {
      quickScheduleModal.classList.remove('active');
    });
  }
  if (btnCancelQuickSchedule) {
    btnCancelQuickSchedule.addEventListener('click', () => {
      quickScheduleModal.classList.remove('active');
    });
  }

  if (btnSaveQuickSchedule) {
    btnSaveQuickSchedule.addEventListener('click', () => {
      const newSchedule = getScheduleFromInputs('quick');
      const totalExiles = newSchedule.reduce((a, b) => a + b, 0);
      const newCap = Math.max(1, currentState.playerCount - totalExiles);

      socket.emit(
        'schedule:update',
        {
          exileSchedule: newSchedule,
          bunkerCapacity: newCap,
        },
        (result) => {
          if (result.success) quickScheduleModal.classList.remove('active');
        },
      );
    });
  }

  // Game Setup Modal Logic
  btnGameSetup.addEventListener('click', () => {
    inputPlayerCount.value = currentState.playerCount;
    btnSaveSetup.textContent =
      currentState.gameStatus === 'setup' ? 'Salvează și începe jocul' : 'Salvează configurarea';
    document.getElementById('setupCapacityHint').textContent =
      `Locuri în buncăr: ${currentState.bunkerCapacity} • Exilări prevăzute: ${currentState.expectedExiles}`;
    inputPlayerCount.disabled = currentState.gameStatus !== 'setup';
    document.querySelector(`input[name="setupGoal"][value="${currentState.goal}"]`).checked = true;
    document.querySelector(`input[name="setupMode"][value="${currentState.mode}"]`).checked = true;
    playerNamesSetupGrid.replaceChildren();
    updateSetupPlayerNames();

    const currentSchedule =
      currentState.exileSchedule ||
      currentState.votingSchedule ||
      getAutoScheduleForCount(currentState.playerCount);
    setScheduleInputs('', currentSchedule, currentState.playerCount);

    gameSetupModal.classList.add('active');
  });

  btnCloseSetup.addEventListener('click', () => {
    gameSetupModal.classList.remove('active');
  });
  btnCancelSetup.addEventListener('click', () => {
    gameSetupModal.classList.remove('active');
  });

  inputPlayerCount.addEventListener('input', () => {
    const count = Math.max(4, Math.min(22, parseInt(inputPlayerCount.value, 10) || 10));
    const autoSchedule = getAutoScheduleForCount(count);
    setScheduleInputs('', autoSchedule, count);
    updateSetupPlayerNames();
  });

  function updateSetupPlayerNames() {
    const count = Math.max(4, Math.min(22, parseInt(inputPlayerCount.value, 10) || 10));
    const drafts = [...playerNamesSetupGrid.querySelectorAll('input')].map((input) => input.value);
    playerNamesSetupGrid.innerHTML = '';

    for (let i = 1; i <= count; i++) {
      const existing = currentState.players && currentState.players[i - 1];
      const div = document.createElement('div');
      div.className = 'input-group';
      div.innerHTML = `
        <label style="font-size:0.75rem; color:var(--text-dim)">Jucător ${i}:</label>
        <input type="text" maxlength="60" class="input-control setup-name-input" data-index="${i - 1}" value="${escapeHtml(drafts[i - 1] ?? (existing ? existing.name : `Jucător ${i}`))}">
      `;
      playerNamesSetupGrid.appendChild(div);
    }
  }

  btnSaveSetup.addEventListener('click', () => {
    const count = Math.max(4, Math.min(22, parseInt(inputPlayerCount.value, 10) || 10));
    const goal = document.querySelector('input[name="setupGoal"]:checked').value;
    const mode = document.querySelector('input[name="setupMode"]:checked').value;
    const exileSchedule = getScheduleFromInputs('');
    const totalExiles = exileSchedule.reduce((a, b) => a + b, 0);
    const bunkerCap = Math.max(1, count - totalExiles);

    const names = [];
    document.querySelectorAll('.setup-name-input').forEach((input) => {
      names.push(input.value.trim() || `Jucător ${parseInt(input.dataset.index, 10) + 1}`);
    });

    if (totalExiles >= count) {
      showToast('Planul trebuie să lase cel puțin un supraviețuitor.', true);
      return;
    }
    socket.emit(
      'game:setup',
      {
        playerCount: count,
        goal: goal,
        mode: mode,
        exileSchedule: exileSchedule,
        bunkerCapacity: bunkerCap,
        playerNames: names,
        preserveCards: true,
      },
      (result) => {
        if (result.success) gameSetupModal.classList.remove('active');
      },
    );
  });

  // Reset Game Handlers
  function handleResetGame() {
    if (!currentState) return;
    const { gameId, playerCount } = currentState;
    if (
      confirm(
        'Ești sigur că vrei să resetezi jocul de la început?\n\nPartida curentă va fi arhivată automat înainte de resetare.',
      )
    ) {
      socket.emit('game:reset_and_save', { gameId, playerCount });
    }
  }

  if (btnResetGame) {
    btnResetGame.addEventListener('click', handleResetGame);
  }
  if (btnFinaleSaveReset) {
    btnFinaleSaveReset.addEventListener('click', handleResetGame);
  }

  // Dynamic Roster Add/Remove Handlers
  if (btnRosterAddPlayer) {
    btnRosterAddPlayer.addEventListener('click', () => {
      socket.emit('player:add');
    });
  }
  if (btnRosterRemovePlayer) {
    btnRosterRemovePlayer.addEventListener('click', () => {
      if (currentState && currentState.players.length > 4) {
        const last = currentState.players[currentState.players.length - 1];
        if (
          confirm(`Ești sigur că vrei să elimini ultimul jucător (#${last.id} - ${last.name})?`)
        ) {
          socket.emit('player:remove');
        }
      } else {
        alert('Numărul minim este de 4 jucători!');
      }
    });
  }

  const tvViewButtons = document.querySelectorAll('[data-tv-view]');
  function renderTvControls() {
    const { mode, size, page } = currentState.tvDisplay ?? { mode: 'local', size: 4, page: 0 };
    const selected = mode === 'pages' ? String(size) : mode;
    for (const button of tvViewButtons)
      button.setAttribute('aria-pressed', String(button.dataset.tvView === selected));
    document.getElementById('btnShowVotingOnTv').disabled = !window.BunkerRules.showVoteTally(currentState);
    document.getElementById('tvRemotePagination').hidden = mode !== 'pages';
    if (mode === 'pages') {
      const pages = Math.ceil(currentState.players.length / size);
      document.getElementById('tvRemotePage').textContent = `Pagina ${Math.min(page + 1, pages)} / ${pages}`;
      document.getElementById('btnTvRemotePrevious').disabled = pages < 2;
      document.getElementById('btnTvRemoteNext').disabled = pages < 2;
    }
  }
  for (const button of tvViewButtons) {
    button.onclick = () => {
      const view = button.dataset.tvView;
      socket.emit('tv:display', view === '4' || view === '6'
        ? { mode: 'pages', size: Number(view) }
        : { mode: view });
    };
  }
  document.getElementById('btnTvRemotePrevious').onclick = () => socket.emit('tv:display', { delta: -1 });
  document.getElementById('btnTvRemoteNext').onclick = () => socket.emit('tv:display', { delta: 1 });
  document.getElementById('btnRevokeModeratorSessions').onclick = async () => {
    if (!confirm('Revoci accesul celorlalte console de moderator?')) return;
    try {
      const response = await fetch('/api/sessions/others', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${socket.auth.token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      showToast(`Sesiuni revocate: ${result.count}.`);
    } catch (error) {
      showToast(error.message || 'Sesiunile nu au putut fi revocate.', true);
    }
  };

  // Setup TV Urls
  function setupTvUrls(serverIps, port) {
    const localTv = `http://localhost:${port}/tv`;
    const netIp = !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? window.location.hostname
      : (serverIps && serverIps[0]) || window.location.hostname;
    const netTv = `${window.location.protocol}//${netIp}:${port}/tv`;
    const qr = qrcode(0, 'M');
    qr.addData(netTv);
    qr.make();
    document.getElementById('tvQrCode').innerHTML = qr.createSvgTag({
      cellSize: 4,
      margin: 12,
      scalable: true,
    });

    document.getElementById('localTvUrl').textContent = localTv;
    document.getElementById('networkTvUrl').textContent = netTv;

    document.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.copy;
        const text = document.getElementById(id).textContent;
        try {
          if (navigator.clipboard && window.isSecureContext)
            await navigator.clipboard.writeText(text);
          else {
            const field = document.createElement('textarea');
            field.value = text;
            document.body.appendChild(field);
            field.select();
            const copied = document.execCommand('copy');
            field.remove();
            if (!copied) throw new Error();
          }
        } catch {
          showToast(`Copiază manual adresa: ${text}`, true);
          return;
        }
        btn.textContent = 'Copiat!';
        setTimeout(() => {
          btn.textContent = 'Copiază Link';
        }, 2000);
      };
    });
  }
  document
    .getElementById('btnStartVoting')
    .addEventListener('click', () => socket.emit('votes:start'));
  document
    .getElementById('btnCloseVoting')
    .addEventListener('click', () => socket.emit('votes:result'));
  document.getElementById('btnUndo').addEventListener('click', () => socket.emit('game:undo'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCardPicker();
      gameSetupModal.classList.remove('active');
      quickScheduleModal.classList.remove('active');
      soundFxModal.classList.remove('active');
      document.getElementById('historyModal').classList.remove('active');
    }
  });
  document.getElementById('btnHistory').addEventListener('click', async () => {
    const dialog = document.getElementById('historyModal'),
      list = document.getElementById('historyList');
    dialog.classList.add('active');
    list.textContent = 'Se încarcă…';
    try {
      const response = await fetch('/api/history', {
        headers: { Authorization: `Bearer ${socket.auth.token}` },
      });
      if (!response.ok) throw new Error('Istoricul nu poate fi încărcat.');
      const games = await response.json();
      list.textContent = games.length ? '' : 'Nu există încă partide arhivate.';
      for (const game of games) {
        const row = document.createElement('div');
        row.className = 'history-row';
        const label = document.createElement('span');
        label.textContent = `${game.formattedDate} • ${game.catastropheTitle} • ${game.survivorsCount} supraviețuitori / ${game.playerCount} jucători`;
        const button = document.createElement('button');
        button.className = 'btn btn-secondary btn-sm';
        button.textContent = 'Descarcă JSON';
        button.onclick = async () => {
          try {
            const response = await fetch(`/api/history/${encodeURIComponent(game.filename)}`, {
              headers: { Authorization: `Bearer ${socket.auth.token}` },
            });
            if (!response.ok) throw new Error();
            const url = URL.createObjectURL(await response.blob()),
              link = document.createElement('a');
            link.href = url;
            link.download = game.filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {
            showToast('Descărcarea a eșuat.', true);
          }
        };
        row.append(label, button);
        list.appendChild(row);
      }
    } catch (error) {
      list.textContent = error.message;
    }
  });
  document.getElementById('btnCloseHistory').onclick = () =>
    document.getElementById('historyModal').classList.remove('active');
  socket.start();
});
