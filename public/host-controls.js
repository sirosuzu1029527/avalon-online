(() => {
  const originalRenderMain = renderMain;
  const originalRenderGameover = renderGameover;

  function renderHostEndGameControl() {
    if (!state || !isHost() || state.phase === 'lobby' || state.phase === 'gameover') return;
    if (document.getElementById('endGameBtn')) return;

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.marginTop = '20px';
    actions.innerHTML = '<button id="endGameBtn" class="btn danger">ゲーム終了</button>';
    mainContent.appendChild(actions);

    document.getElementById('endGameBtn').onclick = () => {
      if (confirm('現在のゲームを終了しますか？\n全員の役職が公開されます。')) {
        action('endGame');
      }
    };
  }

  renderGameover = function () {
    if (state.winner !== null) {
      originalRenderGameover();
      return;
    }

    const reveal = state.players.map(p=>`<div class="reveal-card"><div class="rname">${escapeHtml(p.name)}</div><div class="rrole ${p.team==='good'?'team-good':'team-evil'}">${escapeHtml(roleName(p.role))} / ${p.team==='good'?'善陣営':'悪陣営'}</div></div>`).join('');
    mainContent.innerHTML = `<div class="result-title">ゲーム終了</div><p class="lead" style="text-align:center">${escapeHtml(state.winnerReason||'')}</p><div class="role-reveal">${reveal}</div>${isHost()?'<div class="actions"><button id="restartBtn" class="btn primary">ロビーに戻って再戦</button></div>':''}`;
    if (isHost()) $('restartBtn').onclick=()=>action('restartGame');
  };

  renderMain = function () {
    originalRenderMain();
    renderHostEndGameControl();
  };
})();
