(() => {
  const QUEST_TEAMS = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
  };

  const previousRenderQuests = renderQuests;
  const previousRenderQuestResult = renderQuestResult;

  renderQuests = function () {
    previousRenderQuests();
    if (!state || state.phase === 'lobby') return;

    const teams = QUEST_TEAMS[state.players.length];
    if (!teams) return;

    // The base renderer shows only the current quest's compact condition line.
    // The overview below supersedes it while keeping the existing circles at the top.
    questPanel.querySelector(':scope > .tiny.muted')?.remove();

    const rows = teams.map((teamSize, index) => {
      const requiredFails = index === 3 && state.players.length >= 7 ? 2 : 1;
      const quest = state.quests?.[index];
      const isCurrent = !quest && index === state.questIndex && state.phase !== 'gameover';
      const statusClass = quest ? (quest.success ? ' success' : ' fail') : (isCurrent ? ' current' : '');

      if (quest) {
        const participants = (quest.team || []).map(playerName).map(escapeHtml).join(' / ') || '不明';
        const actualTeamSize = quest.team?.length || teamSize;
        const successVotes = Math.max(0, actualTeamSize - (quest.failCount || 0));
        const resultMark = quest.success ? '✓' : '✕';
        return `<div class="quest-plan-row${statusClass}"><div class="quest-plan-heading"><span class="quest-plan-number">${index + 1}</span><b>Quest ${index + 1}</b><span class="quest-plan-result">${resultMark}</span></div><div class="quest-plan-detail"><span>参加者：${participants}</span><span>成功票：<b>${successVotes}</b> / ${actualTeamSize}</span></div></div>`;
      }

      return `<div class="quest-plan-row${statusClass}"><div class="quest-plan-heading"><span class="quest-plan-number">${index + 1}</span><b>Quest ${index + 1}</b></div><div class="quest-plan-detail"><span>参加人数：<b>${teamSize}</b>人</span><span>失敗判定：<b>${requiredFails}</b>票以上</span></div></div>`;
    }).join('');

    questPanel.insertAdjacentHTML('beforeend', `<div class="quest-plan">${rows}</div>`);
  };

  renderQuestResult = function () {
    previousRenderQuestResult();
    const result = state?.questOutcome;
    if (!result) return;
    const summary = [...mainContent.querySelectorAll('.lead')].find(el => el.textContent.includes('クエスト失敗に必要な失敗票'));
    if (summary) summary.innerHTML = `失敗票 <b>${result.failCount}</b>票 / 失敗判定 <b>${result.requiredFails}</b>票以上`;
  };
})();
