(() => {
  const MISSION_TEAMS = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
  };

  const previousRenderMissions = renderMissions;

  renderMissions = function () {
    previousRenderMissions();
    if (!state || state.phase === 'lobby') return;

    const teams = MISSION_TEAMS[state.players.length];
    if (!teams) return;

    // The base renderer shows only the current mission's compact condition line.
    // The overview below supersedes it while keeping the existing circles at the top.
    missionPanel.querySelector(':scope > .tiny.muted')?.remove();

    const rows = teams.map((teamSize, index) => {
      const requiredFails = index === 3 && state.players.length >= 7 ? 2 : 1;
      const requiredSuccesses = teamSize - requiredFails + 1;
      const mission = state.missions?.[index];
      const isCurrent = !mission && index === state.missionIndex && state.phase !== 'gameover';
      const statusClass = mission ? (mission.success ? ' success' : ' fail') : (isCurrent ? ' current' : '');

      if (mission) {
        const participants = (mission.team || []).map(playerName).map(escapeHtml).join(' / ') || '不明';
        const actualTeamSize = mission.team?.length || teamSize;
        const successVotes = Math.max(0, actualTeamSize - (mission.failCount || 0));
        const resultMark = mission.success ? '✓' : '✕';
        return `<div class="mission-plan-row${statusClass}"><div class="mission-plan-heading"><span class="mission-plan-number">${index + 1}</span><b>Mission ${index + 1}</b><span class="mission-plan-result">${resultMark}</span></div><div class="mission-plan-detail"><span>参加者：${participants}</span><span>成功票：<b>${successVotes}</b> / ${actualTeamSize}</span></div></div>`;
      }

      return `<div class="mission-plan-row${statusClass}"><div class="mission-plan-heading"><span class="mission-plan-number">${index + 1}</span><b>Mission ${index + 1}</b></div><div class="mission-plan-detail"><span>参加人数：<b>${teamSize}</b>人</span><span>成功に必要：<b>${requiredSuccesses}</b>人</span></div></div>`;
    }).join('');

    missionPanel.insertAdjacentHTML('beforeend', `<div class="mission-plan">${rows}</div>`);
  };
})();
