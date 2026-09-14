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

    const rows = teams.map((teamSize, index) => {
      const requiredFails = index === 3 && state.players.length >= 7 ? 2 : 1;
      const requiredSuccesses = teamSize - requiredFails + 1;
      const mission = state.missions?.[index];
      const isCurrent = !mission && index === state.missionIndex && state.phase !== 'gameover';
      const statusClass = mission ? (mission.success ? ' success' : ' fail') : (isCurrent ? ' current' : '');
      const special = requiredFails === 2 ? '<span class="mission-plan-special">失敗2票で失敗</span>' : '';
      return `<div class="mission-plan-row${statusClass}"><span class="mission-plan-number">${index + 1}</span><span>参加 <b>${teamSize}</b>人</span><span>成功 <b>${requiredSuccesses}</b>人必要</span>${special}</div>`;
    }).join('');

    missionPanel.insertAdjacentHTML('beforeend', `<div class="mission-plan"><div class="tiny muted mission-plan-title">任務条件</div>${rows}</div>`);
  };
})();
