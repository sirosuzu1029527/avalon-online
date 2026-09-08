(() => {
  const originalRenderMain = renderMain;
  const originalRenderGameover = renderGameover;
  const originalRenderLobby = renderLobby;

  function renderHostEndGameControl() {
    if (!state || !isHost() || state.phase === 'lobby' || state.phase === 'gameover') return;
    if (document.getElementById('endGameBtn')) return;

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.marginTop = '20px';
    actions.innerHTML = '<button id="endGameBtn" class="btn danger">ゲーム終了</button>';
    mainContent.appendChild(actions);

    document.getElementById('endGameBtn').onclick = () => {
      if (confirm('現在のゲームを終了しますか？\n全員の役職が公開されます。')) action('endGame');
    };
  }

  function gameoverMarkup() {
    const reveal = state.players.map(p=>`<div class="reveal-card"><div class="rname">${escapeHtml(p.name)}</div><div class="rrole ${p.team==='good'?'team-good':'team-evil'}">${escapeHtml(roleName(p.role))} / ${p.team==='good'?'善陣営':'悪陣営'}</div></div>`).join('');
    let title;
    if (state.winner === 'good') title = '<div class="result-title good">善陣営の勝利</div>';
    else if (state.winner === 'evil') title = '<div class="result-title evil">悪陣営の勝利</div>';
    else title = '<div class="result-title">ゲーム終了</div>';

    let actions = '';
    if (!state.rematchOpen) {
      actions = isHost()
        ? '<div class="actions"><button id="restartBtn" class="btn primary">ロビーに戻って再戦</button></div>'
        : '<div class="notice">ホストが再戦ロビーを開くまで、この画面で結果を確認できます。</div>';
    } else {
      actions = '<div class="notice good">再戦ロビーが開きました。準備ができたらロビーに戻ってください。</div><div class="actions"><button id="returnLobbyBtn" class="btn primary">ロビーに戻る</button></div>';
    }
    return `${title}<p class="lead" style="text-align:center">${escapeHtml(state.winnerReason||'')}</p><div class="role-reveal">${reveal}</div>${actions}`;
  }

  renderGameover = function () {
    mainContent.innerHTML = gameoverMarkup();
    if (!state.rematchOpen && isHost() && $('restartBtn')) $('restartBtn').onclick=()=>action('restartGame');
    if (state.rematchOpen && $('returnLobbyBtn')) $('returnLobbyBtn').onclick=()=>action('returnToLobby');
  };

  renderLobby = function () {
    originalRenderLobby();
    if (state.rematchOpen) {
      const notice = document.createElement('div');
      notice.className = 'notice gold';
      notice.style.marginBottom = '16px';
      notice.textContent = '結果画面からロビーに戻った参加者だけが次のゲームに参加します。ゲーム開始時点で戻っていない参加者は部屋から外れます。';
      mainContent.insertBefore(notice, mainContent.firstChild.nextSibling);
    }
  };

  renderMain = function () {
    originalRenderMain();
    renderHostEndGameControl();
  };
})();
