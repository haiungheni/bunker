// TV / Big Screen Presentation Controller
document.addEventListener('DOMContentLoaded', async () => {
  const socket = window.BunkerClient.create('tv');
  const escapeHtml = window.BunkerClient.escapeHtml;
  let page = 0,
    pageSize = automaticPageSize(),
    lastSpeakerId = null;
  let currentState = null;
  let detailsOpen = false;
  let detailsOwnFullscreen = false;
  let displayMode = 'auto';
  try {
    displayMode = localStorage.getItem('bunkerTvDisplay') || 'auto';
  } catch {}
  if (!['auto', 'all', '2', '4', '6', '8', '12'].includes(displayMode)) displayMode = 'auto';
  const sound = window.soundEngine;

  // Socket Events
  socket.on('init', ({ state }) => {
    currentState = state;
    renderTv();
    if (!state.activeSpeakerId && protocol.dataset.scene === 'speaker') hideProtocol();
    if (
      state.cardModal &&
      (isPersistentModal(state.cardModal) || Date.now() - state.cardModal.timestamp < 12000)
    )
      showCinematicModal(state.cardModal);
  });

  socket.on('game:state', (state) => {
    const prevModal = currentState ? currentState.cardModal : null;
    currentState = state;
    renderTv();
    if (!state.activeSpeakerId && protocol.dataset.scene === 'speaker') hideProtocol();

    // Check if new modal arrived
    if (state.cardModal && (!prevModal || prevModal.timestamp !== state.cardModal.timestamp)) {
      showCinematicModal(state.cardModal);
    } else if (!state.cardModal) {
      hideCinematicModal();
      if (['bunker', 'catastrofe', 'amenintare'].includes(protocol.dataset.scene)) hideProtocol();
    }
  });

  socket.on('timer:tick', ({ timeLeft, duration, type, activeSpeakerId, endsAt }) => {
    if (currentState) {
      Object.assign(currentState.timer, { timeLeft, duration, type, endsAt, isRunning: true });
      currentState.activeSpeakerId = activeSpeakerId;
    }
    updateTvTimer(timeLeft, duration, activeSpeakerId);
    tvSpeakerBar.classList.add('active');

    // Beep in last 5 seconds of speech timer
    if (timeLeft <= 5 && timeLeft > 0 && type === 'speech') {
      sound.play('tick');
    }
  });

  socket.on('timer:done', ({ type, activeSpeakerId }) => {
    if (currentState) {
      currentState.timer.timeLeft = 0;
      currentState.timer.isRunning = false;
    }
    updateTvTimer(0, currentState?.timer.duration || 30, null);
    sound.play('gong');
  });

  socket.on('audio:play', ({ cue }) => {
    sound.play(cue);
  });

  socket.on('player:exiled_announcement', ({ player, round }) => {
    showCinematicExile(player, round);
  });
  socket.on('cinematic:play', showProtocol);

  // UI Element Selectors
  const tvRoundVal = document.getElementById('tvRoundVal');
  const tvPhaseVal = document.getElementById('tvPhaseVal');
  const tvBunkerCapVal = document.getElementById('tvBunkerCapVal');

  const tvSpeakerBar = document.getElementById('tvSpeakerBar');
  const tvSpeakerCaption = document.getElementById('tvSpeakerCaption');
  const tvSpeakerName = document.getElementById('tvSpeakerName');
  const tvSpeakerTimer = document.getElementById('tvSpeakerTimer');
  const tvTimerBarFill = document.getElementById('tvTimerBarFill');

  const tvCatastropheImg = document.getElementById('tvCatastropheImg');
  const tvCatastropheTitle = document.getElementById('tvCatastropheTitle');
  const tvCatastropheDesc = document.getElementById('tvCatastropheDesc');

  const tvBunkerCardsList = document.getElementById('tvBunkerCardsList');
  const tvBunkerRevealedCount = document.getElementById('tvBunkerRevealedCount');
  const tvPlayersGrid = document.getElementById('tvPlayersGrid');
  const tvPlayersArea = document.getElementById('tvPlayersArea');
  const tvShowDetails = document.getElementById('tvShowDetails');
  const tvVotingStatus = document.getElementById('tvVotingStatus');
  const tvVoteTally = document.getElementById('tvVoteTally');
  const tvVoteCounts = document.getElementById('tvVoteCounts');

  // Cinematic Modal
  const tvCinematicModal = document.getElementById('tvCinematicModal');
  const tvModalCardImg = document.getElementById('tvModalCardImg');
  const tvModalCategoryBadge = document.getElementById('tvModalCategoryBadge');
  const tvModalPlayerTag = document.getElementById('tvModalPlayerTag');
  const tvModalCardTitle = document.getElementById('tvModalCardTitle');
  const tvModalCardDesc = document.getElementById('tvModalCardDesc');

  const CATEGORIES = [
    { slug: 'profesie', name: 'Profesie', icon: '💼' },
    { slug: 'biologie', name: 'Biologie', icon: '👤' },
    { slug: 'sanatate', name: 'Sănătate', icon: '❤️' },
    { slug: 'hobby', name: 'Hobby', icon: '🏆' },
    { slug: 'bagaj', name: 'Bagaj', icon: '🎒' },
    { slug: 'fapte', name: 'Informație', icon: '📜' },
    { slug: 'conditii_speciale', name: 'Condiție Spec.', icon: '✨' },
  ];

  const PHASE_NAMES = {
    bunker_reveal: 'Cercetare Buncăr',
    card_reveal: 'Dezvăluire Cărți',
    discussion: 'Discuție Vot',
    voting: 'Votare',
    tiebreak: 'Balotaj',
    round_end: 'Sfârșit Rundă',
    finale: 'Epilog / Final',
  };

  function renderTv() {
    if (!currentState) return;

    const mode = currentState.tvDisplay?.mode || 'local';
    document.body.classList.toggle('tv-controlled', mode !== 'local');
    document.body.classList.toggle('tv-votes-only', mode === 'votes');
    document.body.classList.toggle(
      'tv-details-open',
      detailsOpen || ['all', 'pages'].includes(mode),
    );
    const coveringCard = Boolean(
      currentState.cardModal &&
      currentState.cardModal.timestamp === currentState.tvDisplay?.coveredCardAt,
    );
    document.body.classList.toggle('tv-card-covered', coveringCard);
    if (mode === 'votes' || coveringCard) hideProtocol();
    renderHud();
    renderCatastrophe();
    renderBunkerRack();
    renderVoteTally();
    renderPlayersGrid();
    tvShowDetails.disabled = false;
  }

  function renderHud() {
    tvRoundVal.textContent = `${currentState.round} / ${currentState.totalRounds || 5}`;
    tvPhaseVal.textContent = PHASE_NAMES[currentState.phase] || currentState.phase;

    const aliveCount = currentState.players.filter((p) => p.status === 'alive').length;
    tvBunkerCapVal.textContent = `${currentState.bunkerCapacity} locuri / ${aliveCount} rămași`;

    // Active speaker bar
    tvSpeakerCaption.hidden = !currentState.activeSpeakerId;
    if (currentState.activeSpeakerId) {
      const speaker = currentState.players.find((p) => p.id === currentState.activeSpeakerId);
      if (speaker) {
        tvSpeakerBar.classList.add('active');
        tvSpeakerName.textContent = `${speaker.name} (#${speaker.seat || speaker.id})`;
        const timer = currentState.timer || { timeLeft: 30, duration: 30 };
        updateTvTimer(timer.timeLeft, timer.duration, speaker.id);
      } else {
        tvSpeakerBar.classList.remove('active');
      }
    } else {
      const timer = currentState.timer;
      const expiredSpeech = timer.type === 'speech' && timer.timeLeft === 0 && !timer.isRunning;
      tvSpeakerBar.classList.toggle(
        'active',
        expiredSpeech ||
          (timer.type !== 'speech' && (timer.isRunning || timer.timeLeft !== timer.duration)),
      );
      tvSpeakerName.textContent = expiredSpeech
        ? 'Timp expirat'
        : timer.type === 'defense'
          ? 'Apărare în balotaj'
          : timer.type === 'discussion'
            ? 'Discuție de grup'
            : 'Cronometru';
      updateTvTimer(timer.timeLeft, timer.duration, null);
    }
  }

  function updateTvTimer(timeLeft, duration, speakerId) {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    tvSpeakerTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const pct = Math.max(0, Math.min(100, (timeLeft / (duration || 30)) * 100));
    tvTimerBarFill.style.width = `${pct}%`;

    if (speakerId !== null && speakerId !== undefined) {
      tvSpeakerBar.classList.add('active');
    }
  }

  function renderCatastrophe() {
    const cat = currentState.catastrophe;
    tvCatastropheImg.hidden = !cat?.image;
    if (cat?.image) tvCatastropheImg.src = cat.image;
    if (cat) {
      tvCatastropheTitle.textContent = cat.title;
      tvCatastropheDesc.textContent = cat.description || '';
    } else {
      tvCatastropheTitle.textContent = 'Buncăr Activ';
      tvCatastropheDesc.textContent = 'Așteptare detalii catastrofă...';
    }
  }

  function renderBunkerRack() {
    const bCards = currentState.bunkerCards || [];
    const revealedCount = bCards.filter((c) => c.revealed).length;
    tvBunkerRevealedCount.textContent = `${revealedCount}/5 Cercetate`;

    tvBunkerCardsList.innerHTML = '';

    bCards.forEach((bCard, idx) => {
      const item = document.createElement('div');
      item.className = `tv-bunker-item ${bCard.revealed ? 'revealed' : ''}`;

      item.innerHTML = `
        ${bCard.revealed ? `<img src="${escapeHtml(bCard.image)}" alt="${escapeHtml(bCard.title)}" class="tv-bunker-thumb">` : '<span class="sealed-sector" aria-label="Sector sigilat">🔒</span>'}
        <div class="tv-bunker-text">
          <span class="tv-bunker-round-tag">RUNDA ${idx + 1}</span>
          <span class="tv-bunker-title">${bCard.revealed ? escapeHtml(bCard.title) : 'Sector Sigilat'}</span>
        </div>
      `;
      tvBunkerCardsList.appendChild(item);
    });
  }

  function renderVoteTally() {
    const { phase, voteSession, players } = currentState;
    const voting = phase === 'voting' || phase === 'tiebreak';
    const stage = voteSession?.stage;
    const label = {
      idle: 'Pregătire',
      collecting: 'Voturi în direct',
      result: 'Rezultat închis',
      defense: 'Apărarea candidaților',
    }[stage];
    const status = voting ? `${phase === 'tiebreak' ? 'BALOTAJ' : 'VOTARE'} • ${label}` : '';
    if (tvVotingStatus.textContent !== status) tvVotingStatus.textContent = status;

    const showTally = window.BunkerRules.showVoteTally(currentState);
    document.body.classList.toggle('tv-vote-visible', showTally);
    if (showTally && tvVoteTally.hidden) tvPlayersArea.scrollTop = 0;
    tvVoteTally.hidden = !showTally;
    if (!showTally) {
      tvVoteCounts.replaceChildren();
      return;
    }

    const candidates = voteSession.candidates;
    const leaders = window.BunkerRules.topCandidates(currentState);
    if (stage === 'collecting' && leaders.length && protocol.dataset.scene === 'voting')
      hideProtocol();
    tvVoteCounts.innerHTML = players
      .filter(
        (player) =>
          player.status === 'alive' && (!candidates.length || candidates.includes(player.id)),
      )
      .map((player) => {
        const votes = player.votes || 0;
        return `<li class="tv-vote-entry${leaders.includes(player.id) ? ' leading' : ''}">
          <span class="tv-vote-name"><span class="tv-vote-seat">#${player.seat || player.id}</span> ${escapeHtml(player.name)}</span>
          <strong class="tv-vote-value">${votes}<span class="tv-vote-unit"> ${votes === 1 ? 'vot' : 'voturi'}</span></strong>
        </li>`;
      })
      .join('');
  }

  function automaticPageSize() {
    if (window.innerHeight < 800) return 2;
    return window.innerHeight < 1000 || window.innerWidth < 1600 ? 4 : 6;
  }

  function renderPlayersGrid() {
    tvPlayersGrid.innerHTML = '';
    const remote = currentState.tvDisplay;
    const remotePages = remote?.mode === 'pages';
    const detailed = detailsOpen || remote?.mode === 'all' || remotePages;
    const overview = displayMode === 'all' && !detailed;
    if (overview) {
      pageSize = currentState.players.length;
      page = 0;
    } else if (displayMode !== 'auto') pageSize = Number(displayMode);
    const pageCount = Math.max(1, Math.ceil(currentState.players.length / pageSize));
    if (currentState.activeSpeakerId && currentState.activeSpeakerId !== lastSpeakerId) {
      const index = currentState.players.findIndex((p) => p.id === currentState.activeSpeakerId);
      if (index >= 0) page = Math.floor(index / pageSize);
    }
    lastSpeakerId = currentState.activeSpeakerId;
    page = Math.min(page, pageCount - 1);
    tvPlayersGrid.classList.remove('ultra-compact', 'compact');
    const playerCount = currentState.players.length;
    const size = remotePages ? remote.size : pageSize;
    const pageTotal = Math.max(1, Math.ceil(playerCount / size));
    const visiblePage = remotePages ? Math.min(remote.page, pageTotal - 1) : page;
    const showAll = detailed && !remotePages;
    let columns = size <= 4 ? 2 : size <= 8 ? 3 : 4;
    if (detailed) {
      const ideal = Math.ceil(Math.sqrt(showAll ? playerCount : size));
      columns = Math.min(ideal, Math.max(1, Math.floor(window.innerWidth / 225)));
    } else if (overview) columns = Math.max(2, Math.ceil(Math.sqrt(pageSize * 1.2)));
    tvPlayersGrid.classList.toggle('overview', overview);
    tvPlayersGrid.classList.toggle('overview-dense', overview && pageSize > 12);
    tvPlayersGrid.classList.toggle('detail-dense', showAll && playerCount > 12);
    tvPlayersGrid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    tvPlayersGrid.style.gridTemplateRows = overview
      ? `repeat(${Math.ceil(pageSize / columns)}, minmax(0, 1fr))`
      : '';
    for (const id of ['tvNextPage', 'tvPreviousPage', 'tvAutoPage'])
      document.getElementById(id).disabled = overview;
    document.getElementById('tvPageIndicator').textContent =
      showAll || overview
        ? `Toți cei ${playerCount} jucători`
        : `Pagina ${visiblePage + 1} / ${pageTotal} • ${playerCount} dosare`;
    const visible = showAll
      ? currentState.players
      : currentState.players.slice(visiblePage * size, (visiblePage + 1) * size);
    visible.forEach((player) => {
      const cardEl = document.createElement('div');
      const isSpeaking = currentState.activeSpeakerId === player.id;
      const isExiled = player.status === 'exiled';

      cardEl.className = `tv-player-card ${isExiled ? 'exiled' : ''} ${isSpeaking ? 'active-speaker' : ''} ${currentState.voteSession?.candidates.includes(player.id) ? 'vote-candidate' : ''}`;

      // Exile stamp overlay
      let exileStampHtml = '';
      if (isExiled) {
        exileStampHtml = '<div class="exile-stamp">EXILAT</div>';
      }

      // Header
      const headerHtml = `
        <div class="tv-player-header">
          <div class="tv-player-identity">
            <span class="tv-player-id-pill">${player.seat || player.id}</span>
            <span class="tv-player-name">${escapeHtml(player.name)}</span>
          </div>
          <div class="tv-player-status-tag">
            ${isExiled ? '<span class="badge badge-red">Exilat</span>' : '<span class="badge badge-emerald">Candidat</span>'}
          </div>
        </div>
      `;

      // Slots
      let slotsHtml = '<div class="tv-player-slots-grid">';
      CATEGORIES.forEach((cat) => {
        const revealedCard = player.cards[cat.slug];
        if (revealedCard) {
          slotsHtml += `
            <div class="tv-card-slot-item cat-${cat.slug} revealed">
              <span class="tv-slot-cat-icon">${cat.icon}</span>
              ${!detailed && revealedCard.image ? `<img src="${escapeHtml(revealedCard.image)}" alt="${escapeHtml(revealedCard.title)}" class="tv-slot-thumb-img" loading="lazy">` : ''}
              <div class="tv-slot-info">
                <span class="tv-slot-cat-name">${cat.name}</span>
                <span class="tv-slot-title" title="${escapeHtml(revealedCard.title)}">${escapeHtml(revealedCard.title)}</span>
              </div>
            </div>
          `;
        } else {
          slotsHtml += `
            <div class="tv-card-slot-item cat-${cat.slug} empty">
              <span class="tv-slot-cat-icon" style="opacity:0.35">${cat.icon}</span>
              <div class="tv-slot-info">
                <span class="tv-slot-cat-name">${cat.name}</span>
                <span class="tv-slot-unrevealed-text">Nedezvăluit</span>
              </div>
            </div>
          `;
        }
      });
      slotsHtml += '</div>';

      cardEl.innerHTML = exileStampHtml + headerHtml + slotsHtml;
      tvPlayersGrid.appendChild(cardEl);
    });
    // Reduce page density when long revealed titles would push a dossier off-screen.
    if (
      !detailed &&
      displayMode === 'auto' &&
      pageSize > 2 &&
      [...tvPlayersGrid.children].some(
        (el) =>
          el.getBoundingClientRect().bottom + tvPlayersArea.scrollTop > window.innerHeight - 8,
      )
    ) {
      pageSize = pageSize === 6 ? 4 : 2;
      page = 0;
      lastSpeakerId = null;
      renderPlayersGrid();
    }
  }

  // Cinematic Modal Handler
  let modalTimeout = null;
  function isPersistentModal(modal = currentState?.cardModal) {
    return ['catastrofe', 'bunker'].includes(modal?.category || modal?.card?.category);
  }
  function showCinematicModal(modalData) {
    if (!modalData || !modalData.card) return;

    tvModalCardImg.closest('.tv-card-spotlight').hidden = !modalData.card.image;
    if (modalData.card.image) tvModalCardImg.src = modalData.card.image;
    tvModalCategoryBadge.textContent =
      modalData.card.categoryRo ||
      (modalData.category ? modalData.category.toUpperCase() : 'CARTE');
    tvModalCategoryBadge.className = `tv-modal-badge cat-${modalData.category || modalData.card.category}`;

    if (modalData.player) {
      tvModalPlayerTag.textContent = `Dezvăluită de ${modalData.player.name} (#${modalData.player.id})`;
      tvModalPlayerTag.style.display = 'block';
    } else {
      tvModalPlayerTag.style.display = 'none';
    }

    tvModalCardTitle.textContent = modalData.title || modalData.card.title;
    tvModalCardDesc.textContent = modalData.description || modalData.card.description || '';

    tvCinematicModal.classList.remove('active');
    void tvCinematicModal.offsetWidth;
    tvCinematicModal.classList.add('active');
    tvCinematicModal.dataset.scene = modalData.category;
    if (
      Date.now() - modalData.timestamp < 2000 &&
      ['bunker', 'catastrofe', 'amenintare'].includes(modalData.category)
    ) {
      showProtocol({
        scene: modalData.category,
        title:
          modalData.category === 'bunker'
            ? 'SECTOR DEBLOCAT'
            : modalData.category === 'catastrofe'
              ? 'ALERTĂ GLOBALĂ'
              : 'AMENINȚARE DETECTATĂ',
        subtitle: modalData.title || modalData.card.title,
      });
    }

    document.querySelector('.tv-modal-hint').textContent = isPersistentModal(modalData)
      ? 'Afișarea este oprită din consola moderatorului'
      : 'Apasă oriunde pentru a închide';
    clearTimeout(modalTimeout);
    if (!isPersistentModal(modalData))
      modalTimeout = setTimeout(
        () => {
          hideCinematicModal();
        },
        Math.max(0, 12000 - (Date.now() - modalData.timestamp)),
      );
  }

  function hideCinematicModal() {
    tvCinematicModal.classList.remove('active');
    clearTimeout(modalTimeout);
  }

  tvCinematicModal.addEventListener('click', () => {
    if (!isPersistentModal()) hideCinematicModal();
  });

  // Cinematic Exile Modal Logic
  const tvExileOverlay = document.getElementById('tvExileOverlay');
  const tvExileRoundNum = document.getElementById('tvExileRoundNum');
  const tvExilePlayerBadge = document.getElementById('tvExilePlayerBadge');
  const tvExilePlayerName = document.getElementById('tvExilePlayerName');
  const tvExilePlayerSub = document.getElementById('tvExilePlayerSub');
  const tvScreenContainer = document.querySelector('.tv-screen-container');
  let exileTimeout = null;

  function showCinematicExile(player, round) {
    if (!player) return;
    hideProtocol();
    if (!isPersistentModal()) hideCinematicModal();
    if (tvExileRoundNum)
      tvExileRoundNum.textContent = round || (currentState ? currentState.round : 1);
    if (tvExilePlayerBadge) tvExilePlayerBadge.textContent = `#${player.seat || player.id}`;
    if (tvExilePlayerName) tvExilePlayerName.textContent = player.name;
    const prof =
      player.profession ||
      (player.cards && player.cards.profesie ? player.cards.profesie.title : 'Fără profesie');
    const bio =
      player.biology || (player.cards && player.cards.biologie ? player.cards.biologie.title : '');
    if (tvExilePlayerSub) {
      tvExilePlayerSub.textContent = bio
        ? `${escapeHtml(prof)} • ${escapeHtml(bio)} • Refuzat intrare în buncăr`
        : `${escapeHtml(prof)} • Refuzat intrare în buncăr`;
    }

    // Trigger screen shake
    if (tvScreenContainer) {
      tvScreenContainer.classList.remove('tv-screen-shake');
      void tvScreenContainer.offsetWidth; // force reflow
      tvScreenContainer.classList.add('tv-screen-shake');
    }

    if (tvExileOverlay) {
      tvExileOverlay.classList.add('active');
    }

    clearTimeout(exileTimeout);
    exileTimeout = setTimeout(() => {
      hideCinematicExile();
    }, 4500);
  }

  function hideCinematicExile() {
    if (tvExileOverlay) {
      tvExileOverlay.classList.remove('active');
    }
    clearTimeout(exileTimeout);
  }

  if (tvExileOverlay) {
    tvExileOverlay.addEventListener('click', hideCinematicExile);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const dismissingOverlay =
        (tvCinematicModal.classList.contains('active') && !isPersistentModal()) ||
        tvExileOverlay.classList.contains('active') ||
        protocol.classList.contains('active');
      if (!isPersistentModal()) hideCinematicModal();
      hideCinematicExile();
      hideProtocol();
      if (detailsOpen && !dismissingOverlay) setDetails(false);
    }
  });

  function setDetails(open) {
    detailsOpen = open;
    tvShowDetails.setAttribute('aria-pressed', String(open));
    tvShowDetails.textContent = open
      ? 'Revino la afișarea normală'
      : 'Toate dosarele pe tot ecranul';
    tvPlayersArea.scrollTop = 0;
    renderTv();
    if (open && !document.fullscreenElement && document.fullscreenEnabled) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          if (detailsOpen) detailsOwnFullscreen = true;
          else return document.exitFullscreen();
        })
        .catch(() => {});
    } else if (!open && detailsOwnFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
  tvShowDetails.onclick = () => setDetails(!detailsOpen);

  const btnTvFullscreen = document.getElementById('btnTvFullscreen');
  btnTvFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting fullscreen:', err.message);
      });
      btnTvFullscreen.textContent = '🗗';
    } else {
      document.exitFullscreen();
      btnTvFullscreen.textContent = '⛶';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      btnTvFullscreen.textContent = '⛶';
      detailsOwnFullscreen = false;
      if (detailsOpen) setDetails(false);
    } else {
      btnTvFullscreen.textContent = '🗗';
    }
  });
  document.getElementById('tvNextPage').onclick = () => {
    page = (page + 1) % Math.max(1, Math.ceil(currentState.players.length / pageSize));
    renderPlayersGrid();
  };
  document.getElementById('tvPreviousPage').onclick = () => {
    const count = Math.max(1, Math.ceil(currentState.players.length / pageSize));
    page = (page + count - 1) % count;
    renderPlayersGrid();
  };
  document.getElementById('tvPageSize').onchange = (event) => {
    displayMode = event.target.value;
    try {
      localStorage.setItem('bunkerTvDisplay', displayMode);
    } catch {}
    if (displayMode === 'auto') pageSize = automaticPageSize();
    page = 0;
    if (currentState) renderPlayersGrid();
  };
  document.getElementById('tvEnableSound').onclick = () => {
    sound.init();
    sound.setMuted(!sound.muted);
    document.getElementById('tvEnableSound').textContent = sound.muted
      ? 'Activați sunetul'
      : 'Sunet activ';
  };
  sound.setMuted(true);
  const volumeControl = document.getElementById('tvVolume');
  try {
    volumeControl.value = localStorage.getItem('bunkerTvVolume') || '70';
  } catch {}
  sound.setVolume(Number(volumeControl.value) / 100);
  volumeControl.oninput = () => {
    sound.setVolume(Number(volumeControl.value) / 100);
    try {
      localStorage.setItem('bunkerTvVolume', volumeControl.value);
    } catch {}
  };
  setInterval(() => {
    if (
      !currentState ||
      detailsOpen ||
      (currentState.tvDisplay?.mode && currentState.tvDisplay.mode !== 'local') ||
      displayMode === 'all' ||
      currentState.activeSpeakerId ||
      document.getElementById('tvAutoPage').checked === false ||
      (tvCinematicModal.classList.contains('active') &&
        !window.BunkerRules.showVoteTally(currentState))
    )
      return;
    const count = Math.max(1, Math.ceil(currentState.players.length / pageSize));
    if (count > 1) {
      page = (page + 1) % count;
      renderPlayersGrid();
    }
  }, 12000);
  const protocol = document.getElementById('tvProtocolOverlay');
  let protocolTimeout;
  const protocolScenes = {
    bunker: ['🏢', 'EXPLORARE • ACCES AUTORIZAT'],
    catastrofe: ['☣', 'URGENȚĂ • NIVEL CRITIC'],
    amenintare: ['⚠', 'SENZORI • ACTIVITATE OSTILĂ'],
    round: ['◈', 'JURNAL DE SUPRAVIEȚUIRE'],
    voting: ['⚖', 'PROTOCOL DE SELECȚIE'],
    result: ['▣', 'NUMĂRĂTOARE FINALIZATĂ'],
    finale: ['☢', 'PROTOCOL SUPRAVIEȚUIRE'],
    readmit: ['✓', 'ACCES RESTABILIT'],
    speaker: ['🎙', 'CANAL DE COMUNICAȚII'],
  };
  function hideProtocol() {
    protocol.classList.remove('active');
    clearTimeout(protocolTimeout);
  }
  function showProtocol(data) {
    const scene = protocolScenes[data.scene];
    if (!scene) return;
    if (
      currentState &&
      window.BunkerRules.showVoteTally(currentState) &&
      (currentState.tvDisplay?.mode === 'votes' ||
        ['bunker', 'catastrofe', 'amenintare', 'speaker'].includes(data.scene))
    )
      return;
    hideProtocol();
    protocol.dataset.scene = data.scene;
    document.getElementById('protocolEmblem').textContent = scene[0];
    document.getElementById('protocolKicker').textContent = scene[1];
    document.getElementById('protocolTitle').textContent = data.title || '';
    document.getElementById('protocolSubtitle').textContent = data.subtitle || '';
    void protocol.offsetWidth;
    protocol.classList.add('active');
    protocolTimeout = setTimeout(hideProtocol, data.scene === 'speaker' ? 4200 : 3200);
  }
  protocol.onclick = hideProtocol;
  window.addEventListener('resize', () => {
    if (displayMode === 'auto') pageSize = automaticPageSize();
    if (currentState) renderPlayersGrid();
  });
  document.getElementById('tvPageSize').value = displayMode;
  socket.start();
});
