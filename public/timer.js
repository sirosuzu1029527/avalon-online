(() => {
  const TIMER_FIELDS = [
    ['team', 'Team Building'],
    ['vote', 'Approval Vote'],
    ['result', 'Result'],
    ['quest', 'Quest'],
    ['assassination', 'Assassination']
  ];

  let serverTimeOffsetMs = 0;
  const originalRenderPhase = renderPhase;
  const originalRenderLobby = renderLobby;

  function timerRemainingSeconds() {
    if (!state?.timerSettings?.enabled || !state.timer || state.timer.phase !== state.phase) return null;
    if (state.timer.pausedRemainingSeconds != null) return Math.max(0, state.timer.pausedRemainingSeconds);
    if (state.timer.endsAt == null) return null;
    const now = Date.now() + serverTimeOffsetMs;
    return Math.max(0, Math.ceil((state.timer.endsAt - now) / 1000));
  }

  function formatTimer(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(s / 60);
    return `${String(minutes).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderTimerClock() {
    const display = $('timerDisplay');
    if (!display) return;
    const remaining = timerRemainingSeconds();
    if (remaining == null) return;
    display.textContent = formatTimer(remaining);
    display.classList.toggle('timer-warning', remaining > 10 && remaining <= 30);
    display.classList.toggle('timer-critical', remaining <= 10);
    display.classList.toggle('timer-paused', state.timer.pausedRemainingSeconds != null);
    const status = $('timerStatus');
    if (status) status.textContent = remaining === 0 ? 'TIME OVER' : state.timer.pausedRemainingSeconds != null ? '一時停止' : '';
  }

  function timerControlsMarkup() {
    const paused = state.timer?.pausedRemainingSeconds != null;
    const hostControls = isHost() ? `<div class="timer-controls">
      <button id="timerPauseResumeBtn" class="btn small">${paused ? '再開' : '一時停止'}</button>
      <button id="timerResetBtn" class="btn small">リセット</button>
      <span class="timer-set-control"><input id="timerSetSeconds" type="number" min="1" max="3600" step="1" inputmode="numeric" placeholder="秒"><button id="timerSetBtn" class="btn small">セット</button></span>
    </div>` : '';
    return `<div class="timer-wrap"><div class="timer-readout"><span id="timerDisplay">00:00</span><span id="timerStatus" class="timer-status"></span></div>${hostControls}</div>`;
  }

  function bindTimerControls() {
    if (!isHost()) return;
    const pauseResume = $('timerPauseResumeBtn');
    if (pauseResume) pauseResume.onclick = () => action(state.timer?.pausedRemainingSeconds != null ? 'resumeTimer' : 'pauseTimer');
    if ($('timerResetBtn')) $('timerResetBtn').onclick = () => action('resetTimer');
    if ($('timerSetBtn')) $('timerSetBtn').onclick = () => {
      const value = Number($('timerSetSeconds')?.value);
      if (!Number.isInteger(value) || value < 1 || value > 3600) return toast('1〜3600秒で入力してください。');
      action('setTimer', { seconds:value });
    };
  }

  function timerSettingsMarkup() {
    const settings = state.timerSettings;
    if (!settings) return '';
    const fields = TIMER_FIELDS.map(([key,label]) => `<label class="timer-setting-field"><span>${label}</span><span class="timer-setting-input"><input id="timerSetting_${key}" type="number" min="1" max="3600" step="1" inputmode="numeric" value="${settings[key]}"><span>秒</span></span></label>`).join('');
    return `<div class="timer-settings"><div class="subhead">タイマー設定</div><label class="checkline timer-enabled"><input id="timerEnabled" type="checkbox" ${settings.enabled?'checked':''}> タイマーを使用する</label><div class="timer-settings-grid">${fields}</div><p class="tiny muted">各フェーズ開始時に自動スタートします。時間切れは警告のみで、自動進行はしません。</p><div class="actions"><button id="saveTimerSettingsBtn" class="btn">タイマー設定を保存</button></div></div>`;
  }

  function bindTimerSettings() {
    if (!isHost() || !$('saveTimerSettingsBtn')) return;
    $('saveTimerSettingsBtn').onclick = () => {
      const timerSettings = { enabled: $('timerEnabled').checked };
      for (const [key] of TIMER_FIELDS) {
        const value = Number($(`timerSetting_${key}`).value);
        if (!Number.isInteger(value) || value < 1 || value > 3600) return toast('タイマーは1〜3600秒で入力してください。');
        timerSettings[key] = value;
      }
      action('updateTimerSettings', { timerSettings });
    };
  }

  renderPhase = function () {
    if (Number.isFinite(state?.serverNow)) serverTimeOffsetMs = state.serverNow - Date.now();
    originalRenderPhase();
    if (!state?.timerSettings?.enabled) return;
    if (!state.timer || state.timer.phase !== state.phase) return;
    phaseBanner.insertAdjacentHTML('beforeend', timerControlsMarkup());
    bindTimerControls();
    renderTimerClock();
  };

  renderLobby = function () {
    originalRenderLobby();
    if (!isHost()) return;
    mainContent.insertAdjacentHTML('beforeend', timerSettingsMarkup());
    bindTimerSettings();
  };

  setInterval(renderTimerClock, 250);
})();
