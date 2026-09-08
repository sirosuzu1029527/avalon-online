(() => {
  const originalRenderMain = renderMain;

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

  renderMain = function () {
    originalRenderMain();
    renderHostEndGameControl();
  };
})();
