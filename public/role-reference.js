(() => {
  const originalRenderIdentity = renderIdentity;

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
      desc: '善陣営が任務を3回成功させた後、マーリンを当てれば逆転勝利できる。'
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
      return `<div class="notice"><div><b class="${teamClass}">${escapeHtml(meta.name)}</b>${count > 1 ? ` ×${count}` : ''} <span class="tiny muted">${teamLabel}</span></div><div class="tiny" style="margin-top:4px">${escapeHtml(meta.desc)}</div></div>`;
    }).join('');

    return `<details style="margin-top:16px"><summary>このゲームの役職一覧</summary><div class="knowledge" style="margin-top:10px">${rows}</div></details>`;
  }

  renderIdentity = function () {
    originalRenderIdentity();
    if (!state || state.phase === 'lobby' || state.phase === 'gameover') return;
    identityPanel.insertAdjacentHTML('beforeend', roleReferenceMarkup());
  };
})();
