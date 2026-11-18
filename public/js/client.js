window.BunkerClient = (() => {
  const escapeHtml = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  function notify(message, danger = true) {
    document.dispatchEvent(new CustomEvent('bunker:notice', { detail: { message, danger } }));
  }
  function storedToken(value) {
    try {
      if (value !== undefined) sessionStorage.setItem('bunkerToken', value);
      return sessionStorage.getItem('bunkerToken') || '';
    } catch {
      return value || '';
    }
  }
  function requestPin(message) {
    const dialog = document.getElementById('moderatorLogin');
    document.getElementById('loginMessage').textContent =
      message || 'Introdu PIN-ul afișat în terminalul serverului.';
    dialog.hidden = false;
    const input = document.getElementById('moderatorPin');
    input.value = '';
    input.focus();
    return new Promise((resolve) => {
      document.getElementById('loginForm').onsubmit = (event) => {
        event.preventDefault();
        dialog.hidden = true;
        resolve(input.value.trim());
      };
    });
  }
  async function authenticate() {
    let pin;
    while (true) {
      try {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const result = await response.json();
        if (response.ok) {
          storedToken(result.token);
          return result.token;
        }
        pin = await requestPin(result.error);
      } catch {
        pin = await requestPin('Serverul nu poate fi contactat. Verifică rețeaua și reîncearcă.');
      }
    }
  }
  function create(role) {
    const socket = io({
      autoConnect: false,
      query: { role },
      auth: { token: role === 'moderator' ? storedToken() : '' },
    });
    let televisions = 0,
      loggingIn = false,
      gameId;
    socket.on('init', ({ state }) => (gameId = state.gameId));
    socket.on('game:state', (state) => (gameId = state.gameId));
    const updateConnection = () => {
      const badge = document.getElementById(role === 'tv' ? 'tvConnectionStatus' : 'tvStatusBadge');
      if (!badge) return;
      const connected = socket.connected;
      badge.classList.toggle('disconnected', !connected);
      const label = badge.querySelector('.status-text') || badge;
      label.textContent = connected
        ? role === 'tv'
          ? 'Conectat'
          : `${televisions} TV conectat${televisions === 1 ? '' : 'e'}`
        : 'Deconectat • reconectare…';
      document.body.classList.toggle('connection-lost', !connected);
    };
    socket.on('presence', (data) => {
      televisions = data.tvCount;
      updateConnection();
    });
    socket.on('connect', () => {
      updateConnection();
      socket.emit('get:state');
    });
    socket.on('disconnect', updateConnection);
    async function reconnectModerator() {
      if (role !== 'moderator' || loggingIn) return;
      loggingIn = true;
      storedToken('');
      socket.disconnect();
      socket.auth = { token: await authenticate() };
      loggingIn = false;
      socket.connect();
    }
    socket.on('session:expired', reconnectModerator);
    socket.on('connect_error', (error) => {
      updateConnection();
      if (error.message === 'AUTH_REQUIRED') reconnectModerator();
    });
    const emit = socket.emit.bind(socket);
    socket.emit = (event, payload = {}, callback) => {
      if (event === 'get:state') return emit(event, payload, callback);
      if (!socket.connected) {
        notify('Comanda nu a fost trimisă: serverul este deconectat. Reîncearcă după reconectare.');
        callback?.({ success: false });
        return socket;
      }
      const command = { gameId, ...payload };
      socket.timeout(5000);
      emit(event, command, (error, result) => {
        if (error) {
          notify(
            'Confirmarea comenzii nu a sosit. Verifică starea partidei înainte de a repeta acțiunea.',
          );
          callback?.({ success: false });
          return;
        }
        if (!result.success) {
          if (result.code === 'OVERRIDE_REQUIRED' && confirm(result.message))
            socket.emit(
              event,
              { ...command, force: true, confirmationRevision: result.revision },
              callback,
            );
          else {
            notify(result.message);
            if (callback) callback(result);
          }
        } else if (callback) callback(result);
      });
      return socket;
    };
    socket.start = async () => {
      updateConnection();
      if (role === 'moderator' && !socket.auth.token) socket.auth = { token: await authenticate() };
      socket.connect();
    };
    return socket;
  }
  return { create, escapeHtml, notify, storedToken };
})();
