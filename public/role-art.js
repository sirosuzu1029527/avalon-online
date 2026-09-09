(() => {
  const STORAGE_KEY = 'avalonVisualMode';
  const SPRITE_PATH = '/images/role-sprite-small.webp.b64.txt';
  const ROLE_BY_NAME = {
    'マーリン':'merlin','パーシヴァル':'percival','アーサーの忠臣':'loyal','暗殺者':'assassin',
    'モルガナ':'morgana','モードレッド':'mordred','オベロン':'oberon','モードレッドの手下':'minion'
  };
  const ROLE_NAMES_LONGEST_FIRST = Object.entries(ROLE_BY_NAME).sort((a, b) => b[0].length - a[0].length);
  let spritePromise = null;

  function visualMode() {
    return localStorage.getItem(STORAGE_KEY) === 'illustrated' ? 'illustrated' : 'simple';
  }
  function illustrated() { return visualMode() === 'illustrated'; }
  function homeVisible() {
    const home = $('homeView');
    return !!home && !home.classList.contains('hidden');
  }
  function syncVisualClass() {
    document.documentElement.classList.toggle('illustrated-mode', illustrated());
    document.documentElement.classList.toggle('illustrated-home', illustrated() && homeVisible());
  }
  function artMarkup(role, extraClass='') {
    if (!role) return '';
    return `<div class="role-art role-art-${role} ${extraClass}" role="img" aria-label="${escapeHtml(roleName(role))}のイラスト"></div>`;
  }
  function roleFromCard(card) {
    const text = card?.textContent || '';
    return ROLE_NAMES_LONGEST_FIRST.find(([name]) => text.includes(name))?.[1] || null;
  }
  async function loadBase64Image(path, cssVariable) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`artwork load failed: ${path}`);
    const base64 = (await r.text()).replace(/\s+/g, '');
    document.documentElement.style.setProperty(cssVariable, `url("data:image/webp;base64,${base64}")`);
  }
  function ensureSprite() {
    if (document.documentElement.style.getPropertyValue('--role-sprite-image')) return Promise.resolve();
    if (!spritePromise) {
      spritePromise = loadBase64Image(SPRITE_PATH, '--role-sprite-image').catch(err => {
        spritePromise = null;
        console.error(err);
        toast('役職イラストの読み込みに失敗しました。');
      });
    }
    return spritePromise;
  }
  async function toggleVisualMode() {
    const next = illustrated() ? 'simple' : 'illustrated';
    localStorage.setItem(STORAGE_KEY, next);
    syncVisualClass();
    syncToggleButtons();
    if (next === 'illustrated') await ensureSprite();
    if (state) render();
  }
  function configureToggleButton(button) {
    button.textContent = illustrated() ? 'シンプル表示' : 'イラスト表示';
    button.title = illustrated() ? 'イラストを隠してシンプル表示に切り替えます' : '役職と背景のイラストを表示します';
    button.onclick = toggleVisualMode;
  }
  function syncToggleButtons() {
    let roomButton = $('visualModeBtn');
    if (!roomButton) {
      roomButton = document.createElement('button');
      roomButton.id = 'visualModeBtn';
      roomButton.className = 'btn small visual-mode-btn';
      const anchor = $('endGameBtn') || $('leaveBtn');
      anchor?.parentNode?.insertBefore(roomButton, anchor);
    }

    let homeButton = $('homeVisualModeBtn');
    if (!homeButton) {
      homeButton = document.createElement('button');
      homeButton.id = 'homeVisualModeBtn';
      homeButton.className = 'btn small visual-mode-btn home-visual-mode-btn';
      const hero = document.querySelector('.hero-panel');
      hero?.appendChild(homeButton);
    }

    [roomButton, homeButton].filter(Boolean).forEach(configureToggleButton);
  }
  function enhanceIdentity() {
    if (!illustrated() || !state?.me?.role) return;
    ensureSprite();
    const card = identityPanel.querySelector('.role-card');
    if (card && !card.querySelector('.identity-art')) {
      card.insertAdjacentHTML('afterbegin', artMarkup(state.me.role, 'identity-art'));
    }
    identityPanel.querySelectorAll('details .notice').forEach(notice => {
      if (notice.classList.contains('role-reference-illustrated')) return;
      const role = roleFromCard(notice);
      if (!role) return;
      notice.innerHTML = `${artMarkup(role, 'role-reference-art')}<div class="role-reference-copy">${notice.innerHTML}</div>`;
      notice.classList.add('role-reference-illustrated');
    });
  }
  function enhanceGameover() {
    if (!illustrated()) return;
    ensureSprite();
    document.querySelectorAll('.reveal-card').forEach(card => {
      if (card.querySelector('.reveal-art')) return;
      const role = roleFromCard(card);
      if (!role) return;
      card.insertAdjacentHTML('afterbegin', artMarkup(role, 'reveal-art'));
    });
  }

  const previousRenderIdentity = renderIdentity;
  renderIdentity = function () {
    previousRenderIdentity();
    enhanceIdentity();
  };

  if (typeof renderGameover === 'function') {
    const previousRenderGameover = renderGameover;
    renderGameover = function () {
      previousRenderGameover();
      enhanceGameover();
    };
  }

  const previousRender = render;
  render = function () {
    previousRender();
    syncVisualClass();
    syncToggleButtons();
  };

  syncVisualClass();
  syncToggleButtons();
  if (illustrated()) ensureSprite();
})();
