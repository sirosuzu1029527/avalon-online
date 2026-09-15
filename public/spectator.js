(() => {
  const MODE_KEY = 'avalonSpectatorViewMode';
  const previousRenderMain = renderMain;
  const previousRenderIdentity = renderIdentity;
  const previousRenderPlayers = renderPlayers;
  const previousRenderLobby = renderLobby;

  function spectatorMode() {
    return localStorage.getItem(MODE_KEY) === 'gm' ? 'gm' : 'public';
  }
  function isSpectatorViewer() {
    return !!state?.me?.isSpectator;
  }
  function playerLabel(id) {
    return escapeHtml(playerName(id));
  }
  function setMode(mode) {
    localStorage.setItem(MODE_KEY, mode === 'gm' ? 'gm' : 'public');
    render();
  }
  function participationMarkup() {
    if (!state?.me) return '';
    if (isHost()) {
      return '<div class="notice">ホストはプレイヤーとして参加します。観戦者には切り替えできません。</div>';
    }
    const spectator = isSpectatorViewer();
    const canBecomePlayer = state.players.length < 10;
    return `<div class="subhead">参加方法</div><div class="actions"><button id="becomePlayerBtn" class="btn ${spectator?'':'primary'}" ${!spectator||!canBecomePlayer?'disabled':''}>プレイヤー</button><button id="becomeSpectatorBtn" class="btn ${spectator?'primary':''}" ${spectator?'disabled':''}>観戦者</button></div>${spectator&&!canBecomePlayer?'<div class="notice">プレイヤーは10人までです。空きができるとプレイヤーに切り替えられます。</div>':''}`;
  }
  function bindParticipation() {
    const player = $('becomePlayerBtn');
    const spectator = $('becomeSpectatorBtn');
    if (player) player.onclick = () => action('setParticipationType', { participationType:'player' });
    if (spectator) spectator.onclick = () => action('setParticipationType', { participationType:'spectator' });
  }
  function spectatorModeMarkup() {
    const gm = spectatorMode() === 'gm';
    return `<div class="subhead">観戦モード</div><div class="actions"><button id="publicViewBtn" class="btn ${gm?'':'primary'}">通常観戦</button><button id="gmViewBtn" class="btn ${gm?'primary':''}">GM視点</button></div><p class="tiny muted">通常観戦では公開情報のみ表示します。GM視点では役職や投票内容などの秘密情報も表示します。</p>`;
  }
  function bindMode() {
    if ($('publicViewBtn')) $('publicViewBtn').onclick = () => setMode('public');
    if ($('gmViewBtn')) $('gmViewBtn').onclick = () => setMode('gm');
  }
  function gmSecretsMarkup() {
    const secrets = state?.spectatorSecrets;
    if (!secrets || spectatorMode() !== 'gm') return '';
    const roles = (secrets.players || []).map(p => {
      const meta = p.roleMeta;
      if (!meta) return `<div class="notice"><b>${playerLabel(p.id)}</b>：役職未割当</div>`;
      return `<div class="notice"><b>${playerLabel(p.id)}</b>：<span class="${meta.team==='good'?'team-good':'team-evil'}">${escapeHtml(meta.name)}</span> <span class="tiny muted">${meta.team==='good'?'善陣営':'悪陣営'}</span><div class="tiny" style="margin-top:4px">${escapeHtml(meta.desc)}</div></div>`;
    }).join('');
    let phaseSecrets = '';
    if (state.phase === 'vote') {
      phaseSecrets = `<div class="subhead" style="margin-top:14px">承認投票</div>${(secrets.liveVotes||[]).map(v=>`<div class="notice"><b>${playerLabel(v.id)}</b>：${v.submitted?(v.approve?'承認':'否認'):'未投票'}</div>`).join('')}`;
    } else if (state.phase === 'quest') {
      phaseSecrets = `<div class="subhead" style="margin-top:14px">クエスト票</div>${(secrets.liveQuestVotes||[]).map(v=>`<div class="notice"><b>${playerLabel(v.id)}</b>：${v.submitted?(v.success?'成功':'失敗'):'未提出'}</div>`).join('')}`;
    }
    const merlin = secrets.merlinId ? `<div class="notice gold"><b>マーリン：</b>${playerLabel(secrets.merlinId)}</div>` : '';
    const target = secrets.assassinationTargetId ? `<div class="notice"><b>暗殺対象：</b>${playerLabel(secrets.assassinationTargetId)}</div>` : '';
    return `<div class="knowledge" style="margin-top:12px"><div class="subhead">GM情報</div>${merlin}${target}${roles}${phaseSecrets}</div>`;
  }

  renderIdentity = function () {
    if (!isSpectatorViewer()) return previousRenderIdentity();
    identityPanel.innerHTML = `<h3 class="section-title">Spectator</h3><div class="notice">あなたは観戦者です。ゲーム進行の操作には参加しません。</div>${spectatorModeMarkup()}${gmSecretsMarkup()}`;
    bindMode();
  };

  renderPlayers = function () {
    previousRenderPlayers();
    const spectators = state?.spectators || [];
    const rows = spectators.map(s => `<div class="player-row"><span class="dot ${s.connected?'online':''}"></span><span class="name">${escapeHtml(s.name)}${s.id===state.me?.id?'（あなた）':''}</span>${isHost()?`<button class="btn small remove-spectator" data-id="${s.id}">削除</button>`:''}</div>`).join('') || '<div class="muted tiny">観戦者はいません。</div>';
    playersPanel.insertAdjacentHTML('beforeend', `<div class="subhead" style="margin-top:16px">Spectators</div><div class="player-list">${rows}</div>`);
    if (isHost()) playersPanel.querySelectorAll('.remove-spectator').forEach(b => b.onclick = () => action('removeSpectator', { spectatorId:b.dataset.id }));
  };

  renderLobby = function () {
    previousRenderLobby();
    mainContent.insertAdjacentHTML('beforeend', `<div style="margin-top:18px">${participationMarkup()}</div>`);
    bindParticipation();
  };

  function publicResultConfirmationNotice() {
    return `<div class="notice">プレイヤーの確認待ち：<b>${state.resultConfirmationCount}</b> / ${state.resultConfirmationTotal}人</div>`;
  }
  function renderSpectatorMain() {
    if (state.phase === 'lobby' || state.phase === 'gameover') return previousRenderMain();
    const teamNames = (state.selectedTeam || []).map(playerName).map(escapeHtml).join(' / ');
    if (state.phase === 'team') {
      mainContent.innerHTML = `<h2 class="section-title">Quest ${state.questIndex+1} — Team Building</h2><p class="lead">リーダー <b>${playerLabel(state.leaderId)}</b> がクエスト参加者を <b>${state.questTeamSize} 人</b>選んでいます。</p><div class="notice">観戦中です。</div>`;
    } else if (state.phase === 'vote') {
      mainContent.innerHTML = `<h2 class="section-title">Quest ${state.questIndex+1} — Approval Vote</h2><p class="lead">提案チーム：<span class="quest-member">${teamNames}</span></p><div class="notice">プレイヤーの投票を観戦中です。</div>`;
    } else if (state.phase === 'vote_result') {
      const r = state.voteOutcome;
      const votes = (state.voteResults||[]).map(v=>`<div class="vote-chip ${v.approve?'approve':'reject'}"><b>${playerLabel(v.id)}</b><br>${v.approve?'承認':'否認'}</div>`).join('');
      mainContent.innerHTML = `<h2 class="section-title">Quest ${state.questIndex+1} — Vote Result</h2><p class="lead">提案チーム：<span class="quest-member">${teamNames}</span></p><div class="result-title ${r?.approved?'good':'evil'}">${r?.approved?'承認':'否認'}</div><p class="lead" style="text-align:center">承認 <b>${r?.approvals??0}</b> / 否認 <b>${r?.rejects??0}</b></p><div class="vote-reveal">${votes}</div>${publicResultConfirmationNotice()}`;
    } else if (state.phase === 'quest') {
      mainContent.innerHTML = `<h2 class="section-title">Quest ${state.questIndex+1}</h2><p class="lead">クエスト参加者：<span class="quest-member">${teamNames}</span></p><div class="notice">クエスト結果を観戦中です。</div>`;
    } else if (state.phase === 'quest_result') {
      const r = state.questOutcome;
      const names = (r?.team||[]).map(playerName).map(escapeHtml).join(' / ');
      mainContent.innerHTML = `<h2 class="section-title">Quest ${state.questIndex+1} — Result</h2><p class="lead">クエスト参加者：<span class="quest-member">${names}</span></p><div class="result-title ${r?.success?'good':'evil'}">クエスト${r?.success?'成功':'失敗'}</div><p class="lead" style="text-align:center">失敗票 <b>${r?.failCount??0}</b>票 / クエスト失敗に必要な失敗票 <b>${r?.requiredFails??1}</b>票</p>${publicResultConfirmationNotice()}`;
    } else if (state.phase === 'assassination') {
      mainContent.innerHTML = '<h2 class="section-title">Assassination</h2><div class="notice gold">暗殺者がマーリンだと思うプレイヤーを選んでいます。</div>';
    }
  }

  renderMain = function () {
    if (!isSpectatorViewer()) return previousRenderMain();
    renderSpectatorMain();
  };
})();
