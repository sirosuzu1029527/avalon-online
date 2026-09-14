(() => {
  const originalRenderIdentity = renderIdentity;
  const originalRenderLobby = renderLobby;

  const ROLE_REFERENCE = {
    merlin: {
      name: 'マーリン',
      team: 'good',
      desc: 'モードレッド以外の悪陣営を知る。正体を暗殺者に悟られないようにする。'
    },
    percival: {
      name: 'パーシヴァル',
      team: 'good',
      desc: 'マーリンとモルガナの候補を知るが、どちらが本物かは分からない。'
    },
    loyal: {
      name: 'アーサーの忠臣',
      team: 'good',
      desc: '特殊情報を持たない善陣営。'
    },
    assassin: {
      name: '暗殺者',
      team: 'evil',
      desc: '善陣営がクエストを3回成功させた後、マーリンを当てれば逆転勝利できる。'
    },
    morgana: {
      name: 'モルガナ',
      team: 'evil',
      desc: 'パーシヴァルにはマーリン候補として見える。'
    },
    mordred: {
      name: 'モードレッド',
      team: 'evil',
      desc: 'マーリンから正体が見えない。'
    },
    oberon: {
      name: 'オベロン',
      team: 'evil',
      desc: '他の悪陣営から見えず、自分も他の悪陣営を知らない。'
    },
    minion: {
      name: 'モードレッドの手下',
      team: 'evil',
      desc: '特殊能力を持たない悪陣営。'
    }
  };

  function currentRoles() {
    const n = state?.players?.length || 0;
    if (n < 5 || n > 10) return [];

    const evilCount = n <= 6 ? 2 : n <= 9 ? 3 : 4;
    const goodCount = n - evilCount;
    const preset = state.setup?.preset || 'standard';

    if (preset === 'simple') {
      return [
        'merlin',
        ...Array(Math.max(0, goodCount - 1)).fill('loyal'),
        'assassin',
        ...Array(Math.max(0, evilCount - 1)).fill('minion')
      ];
    }

    if (preset === 'custom') {
      const custom = state.setup?.custom || {};
      const good = ['merlin', 'percival'].filter(role => custom[role]);
      const evil = ['assassin', 'morgana', 'mordred', 'oberon'].filter(role => custom[role]);
      return [
        ...good,
        ...Array(Math.max(0, goodCount - good.length)).fill('loyal'),
        ...evil,
        ...Array(Math.max(0, evilCount - evil.length)).fill('minion')
      ];
    }

    const good = ['merlin', 'percival'];
    while (good.length < goodCount) good.push('loyal');
    const evil = n <= 6
      ? ['assassin', 'morgana']
      : n <= 9
        ? ['assassin', 'morgana', 'mordred']
        : ['assassin', 'morgana', 'mordred', 'oberon'];
    while (evil.length < evilCount) evil.push('minion');
    return [...good, ...evil];
  }

  function roleReferenceMarkup() {
    const counts = new Map();
    for (const role of currentRoles()) counts.set(role, (counts.get(role) || 0) + 1);
    if (!counts.size) return '';

    const order = ['merlin', 'percival', 'loyal', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
    const rows = order.filter(role => counts.has(role)).map(role => {
      const meta = ROLE_REFERENCE[role];
      const teamLabel = meta.team === 'good' ? '善陣営' : '悪陣営';
      const teamClass = meta.team === 'good' ? 'team-good' : 'team-evil';
      const count = counts.get(role);
      return `<div class="notice" data-role="${role}"><div><b class="${teamClass}">${escapeHtml(meta.name)}</b>${count > 1 ? ` ×${count}` : ''} <span class="tiny muted">${teamLabel}</span></div><div class="tiny" style="margin-top:4px">${escapeHtml(meta.desc)}</div></div>`;
    }).join('');

    return `<details style="margin-top:16px"><summary>このゲームの役職一覧</summary><div class="knowledge" style="margin-top:10px">${rows}</div></details>`;
  }

  function guestRoleSetupMarkup() {
    const n = state?.players?.length || 0;
    const preset = state.setup?.preset || 'standard';
    const standardRoles = preset === 'standard' ? standardRoleSummary(n) : '';
    const customRoles = preset === 'custom'
      ? `<div><div class="subhead">カスタム役職</div><div class="checkboxes">${['merlin','percival','assassin','morgana','mordred','oberon'].map(role => `<label class="checkline"><input type="checkbox" disabled ${state.setup?.custom?.[role]?'checked':''}> ${escapeHtml(roleName(role))}</label>`).join('')}</div></div>`
      : '';

    return `<div class="setup-grid"><div><div class="subhead">配役プリセット</div><select disabled><option value="standard" ${preset==='standard'?'selected':''}>Standard</option><option value="simple" ${preset==='simple'?'selected':''}>Simple</option><option value="custom" ${preset==='custom'?'selected':''}>Custom</option></select><p class="tiny muted">Standard は人数に応じて特殊役職を増やします。Simple はマーリン＋暗殺者のみです。</p>${standardRoles}</div>${customRoles}</div><div class="notice">配役設定はホストのみ変更できます。</div>`;
  }

  renderLobby = function () {
    originalRenderLobby();
    if (!state || isHost()) return;
    const waitingNotice = [...mainContent.querySelectorAll('.notice')].find(el => el.textContent.includes('ホストがゲームを開始するまでお待ちください。'));
    if (waitingNotice) waitingNotice.insertAdjacentHTML('beforebegin', guestRoleSetupMarkup());
    else mainContent.insertAdjacentHTML('beforeend', guestRoleSetupMarkup());
  };

  renderIdentity = function () {
    originalRenderIdentity();
    if (!state || state.phase === 'lobby' || state.phase === 'gameover') return;
    identityPanel.insertAdjacentHTML('beforeend', roleReferenceMarkup());
  };
})();
