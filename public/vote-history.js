(() => {
  const list = $('voteHistoryList');
  let lastRoom = null;
  let lastHistory = null;

  function renderVoteHistory() {
    if (!state) return;
    // Keep the panel and expanded proposals open across SSE state refreshes.
    const history = state.voteHistory || [];
    const historyKey = JSON.stringify(history);
    if (lastRoom === state.code && lastHistory === historyKey) return;
    const expanded = new Set(
      [...list.querySelectorAll('.vote-history-entry[open]')].map(el => el.dataset.historyIndex)
    );
    lastRoom = state.code;
    lastHistory = historyKey;
    if (!history.length) {
      list.innerHTML = '<div class="muted tiny">確定したチーム投票はまだありません。</div>';
      return;
    }
    list.innerHTML = history.slice().reverse().map((item, i) => {
      const index = String(history.length - 1 - i);
      const title = `第${item.questIndex+1}クエスト・${item.proposalInQuest}回目の提案`;
      const result = item.approved ? '承認' : '否認';
      const team = item.team.map(p => escapeHtml(p.name)).join(' / ');
      const votes = item.votes.map(v => `<div class="vote-chip ${v.approve?'approve':'reject'}"><b>${escapeHtml(v.name)}</b><br>${v.approve?'承認':'否認'}</div>`).join('');
      return `<details class="vote-history-entry" data-history-index="${index}" ${expanded.has(index)?'open':''}><summary><span class="vote-history-summary">${title}</span><span class="vote-history-outcome ${item.approved?'':'reject'}">${result}　${item.approvals}：${item.rejects}</span></summary><div class="vote-history-body"><div class="vote-history-team">リーダー：${escapeHtml(item.leader.name)}<br>提案チーム：<span class="quest-member">${team}</span></div><div class="vote-reveal">${votes}</div></div></details>`;
    }).join('');
  }

  const previousRender = render;
  render = function () {
    previousRender();
    renderVoteHistory();
  };
})();
