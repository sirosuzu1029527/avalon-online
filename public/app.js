let state = null;
let selectedTeam = new Set();
let eventSource = null;

const $ = (id) => document.getElementById(id);
const homeView = $('homeView');
const roomView = $('roomView');
const mainContent = $('mainContent');
const identityPanel = $('identityPanel');
const playersPanel = $('playersPanel');
const missionPanel = $('missionPanel');
const phaseBanner = $('phaseBanner');

function escapeHtml(s='') {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2800);
}
function token() {
  let t = localStorage.getItem('avalonToken');
  if (!t) { t = crypto.randomUUID(); localStorage.setItem('avalonToken', t); }
  return t;
}
function remember(code, name) {
  localStorage.setItem('avalonRoom', code);
  if (name) localStorage.setItem('avalonName', name);
}
function forgetRoom() {
  localStorage.removeItem('avalonRoom');
  eventSource?.close(); eventSource = null;
}
function playerName(id) { return state?.players.find(p => p.id === id)?.name || '???'; }
function roleName(role) {
  return ({merlin:'マーリン',percival:'パーシヴァル',loyal:'アーサーの忠臣',assassin:'暗殺者',morgana:'モルガナ',mordred:'モードレッド',oberon:'オベロン',minion:'モードレッドの手下'})[role] || role;
}
function isHost() { return state?.hostId === state?.me?.id; }
function isLeader() { return state?.leaderId === state?.me?.id; }

async function post(path, body) {
  const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok || data.ok === false) throw new Error(data.message || '操作に失敗しました。');
  return data;
}
async function action(type, payload={}) {
  if (!state) return;
  try { await post('/api/action', { code:state.code, token:token(), type, payload }); }
  catch (e) { toast(e.message); }
}
function connectEvents(code) {
  eventSource?.close();
  eventSource = new EventSource(`/api/events?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token())}`);
  eventSource.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'roomState') {
        state = msg.data;
        selectedTeam = new Set(state.selectedTeam || []);
        homeView.classList.add('hidden'); roomView.classList.remove('hidden');
        render();
      } else if (msg.type === 'kicked') {
        forgetRoom(); state = null; roomView.classList.add('hidden'); homeView.classList.remove('hidden'); toast('部屋から削除されました。');
      }
    } catch {}
  };
  eventSource.onerror = () => {
    // EventSource automatically reconnects. A brief error is normal on mobile network changes.
  };
}
async function enterRoom(path, body) {
  try {
    const data = await post(path, body);
    remember(data.code, body.name);
    connectEvents(data.code);
  } catch (e) { toast(e.message); }
}
async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('clipboard unavailable');
    toast(successMessage);
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(successMessage); } catch { prompt('コピーしてください', text); }
    ta.remove();
  }
}

$('nameInput').value = localStorage.getItem('avalonName') || '';
$('createBtn').onclick = () => {
  const name = $('nameInput').value.trim(); if (!name) return toast('表示名を入力してください。');
  enterRoom('/api/create', { name, token:token() });
};
$('joinBtn').onclick = () => {
  const name = $('nameInput').value.trim(), code = $('codeInput').value.trim().toUpperCase();
  if (!name || !code) return toast('表示名とルームコードを入力してください。');
  enterRoom('/api/join', { code, name, token:token() });
};
$('codeInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,5));
$('copyCodeBtn').onclick = () => state && copyText(state.code, 'ルームコードをコピーしました。');
$('copyLinkBtn').onclick = () => {
  if (!state) return;
  const url = new URL(location.href); url.searchParams.set('room', state.code);
  copyText(url.toString(), '招待リンクをコピーしました。');
};
$('leaveBtn').onclick = async () => {
  if (!state) return;
  try {
    await post('/api/action', { code:state.code, token:token(), type:'leaveRoom', payload:{} });
    forgetRoom(); state=null; roomView.classList.add('hidden'); homeView.classList.remove('hidden'); toast('部屋を退出しました。');
  } catch(e) { toast(e.message); }
};

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('codeInput').value = params.get('room').toUpperCase().slice(0,5);
  const saved = localStorage.getItem('avalonRoom');
  const invited = params.get('room')?.toUpperCase().slice(0,5) || '';
  if (invited && saved && invited !== saved) { forgetRoom(); return; }
  const code = saved;
  if (!code) return;
  try {
    await post('/api/join', { code, token:token(), name:localStorage.getItem('avalonName') || '' });
    connectEvents(code);
  } catch {
    forgetRoom();
  }
}
boot();

function render() {
  if (!state) return;
  $('roomCode').textContent = state.code;
  renderPhase(); renderIdentity(); renderPlayers(); renderMissions(); renderMain(); renderLog();
}
function renderPhase() {
  const leader = state.leaderId ? playerName(state.leaderId) : null;
  const map = {
    lobby: '参加者を待っています。ホストが設定後にゲームを開始します。',
    team: `第${state.missionIndex+1}任務：${escapeHtml(leader)} が ${state.missionTeamSize} 人のチームを編成します。`,
    vote: '提案された任務チームを全員で承認／否認します。',
    mission: '任務参加者が「成功／失敗」を秘密裏に選びます。',
    assassination: '任務3回成功。暗殺者がマーリンだと思うプレイヤーを選びます。',
    gameover: 'ゲーム終了。全役職を公開しています。'
  };
  phaseBanner.innerHTML = map[state.phase] || '';
}
function renderIdentity() {
  if (!state.me?.role) {
    identityPanel.innerHTML = `<h3 class="section-title">Identity</h3><p class="muted tiny">ゲーム開始後、ここにあなたの役職が表示されます。</p>`;
    return;
  }
  const m = state.me.roleMeta, teamClass = m.team === 'good' ? 'team-good' : 'team-evil';
  let knowledge = '';
  if (state.me.knowledge?.length) {
    knowledge = `<div class="knowledge"><strong>あなたが知っている情報</strong>${state.me.knowledge.map(k => {
      if (k.text) return `<div class="notice">${escapeHtml(k.text)}</div>`;
      const names = (k.playerIds||[]).map(playerName).map(escapeHtml).join(' / ') || 'なし';
      return `<div class="notice"><div>${escapeHtml(k.label)}</div><b>${names}</b></div>`;
    }).join('')}</div>`;
  }
  identityPanel.innerHTML = `<h3 class="section-title">Identity</h3><div class="role-card"><div class="role-name ${teamClass}">${escapeHtml(m.name)}</div><div class="badge">${m.team === 'good' ? '善陣営' : '悪陣営'}</div><div class="role-desc">${escapeHtml(m.desc)}</div>${knowledge}</div>`;
}
function renderPlayers() {
  playersPanel.innerHTML = `<h3 class="section-title">Players</h3><div class="player-list">${state.players.map(p => {
    const badges = `${p.isHost?'<span class="badge host">HOST</span>':''}${p.id===state.leaderId?'<span class="badge leader">LEADER</span>':''}`;
    const role = state.phase==='gameover' && p.role ? `<span class="badge ${p.team==='good'?'team-good':'team-evil'}">${escapeHtml(roleName(p.role))}</span>` : '';
    return `<div class="player-row"><span class="dot ${p.connected?'online':''}"></span><span class="name">${escapeHtml(p.name)}${p.id===state.me.id?'（あなた）':''}</span>${role}${badges}</div>`;
  }).join('')}</div>`;
}
function renderMissions() {
  const dots = Array.from({length:5},(_,i) => {
    const m = state.missions[i], cls = m ? (m.success?'success':'fail') : (i===state.missionIndex && !['lobby','gameover'].includes(state.phase)?'current':'');
    return `<div class="mission-dot ${cls}" title="第${i+1}任務">${m ? (m.success?'✓':'✕') : i+1}</div>`;
  }).join('');
  missionPanel.innerHTML = `<h3 class="section-title">Missions</h3><div class="mission-track">${dots}</div><div class="mission-summary"><span>成功 ${state.goodMissionSuccesses}</span><span>失敗 ${state.evilMissionSuccesses}</span></div>${state.phase!=='lobby'&&state.missionTeamSize?`<div class="tiny muted" style="margin-top:10px">第${state.missionIndex+1}任務：${state.missionTeamSize}人 / 失敗に必要な失敗票 ${state.missionRequires}</div>`:''}`;
}
function renderMain() {
  if (state.phase === 'lobby') return renderLobby();
  if (state.phase === 'team') return renderTeam();
  if (state.phase === 'vote') return renderVote();
  if (state.phase === 'mission') return renderMissionVote();
  if (state.phase === 'assassination') return renderAssassination();
  if (state.phase === 'gameover') return renderGameover();
}
function renderLobby() {
  const n = state.players.length, canStart = n >= 5 && n <= 10 && state.players.every(p => p.connected);
  let setup = '';
  if (isHost()) {
    setup = `<div class="setup-grid"><div><div class="subhead">配役プリセット</div><select id="presetSelect"><option value="standard" ${state.setup.preset==='standard'?'selected':''}>Standard</option><option value="simple" ${state.setup.preset==='simple'?'selected':''}>Simple</option><option value="custom" ${state.setup.preset==='custom'?'selected':''}>Custom</option></select><p class="tiny muted">Standard は人数に応じて特殊役職を増やします。Simple はマーリン＋暗殺者のみです。</p></div><div id="customRoles" class="${state.setup.preset==='custom'?'':'hidden'}"><div class="subhead">カスタム役職</div><div class="checkboxes">${['merlin','percival','assassin','morgana','mordred','oberon'].map(r=>`<label class="checkline"><input type="checkbox" data-role="${r}" ${state.setup.custom[r]?'checked':''}> ${roleName(r)}</label>`).join('')}</div></div></div><div class="actions"><button id="startGameBtn" class="btn primary" ${canStart?'':'disabled'}>ゲーム開始</button></div>`;
  } else setup = '<div class="notice">ホストがゲームを開始するまでお待ちください。</div>';
  const kick = isHost() ? `<div class="subhead">参加者管理</div><div class="player-list">${state.players.map(p=>`<div class="player-row"><span class="dot ${p.connected?'online':''}"></span><span class="name">${escapeHtml(p.name)}</span>${p.id!==state.hostId?`<button class="btn small remove-player" data-id="${p.id}">削除</button>`:'<span class="badge host">HOST</span>'}</div>`).join('')}</div>` : '';
  mainContent.innerHTML = `<h2 class="section-title">Waiting Room</h2><p class="lead">現在 <b>${n}</b> 人参加中。5〜10人で開始できます。</p>${!canStart&&isHost()?'<div class="notice gold">5人以上そろい、全員が接続中になると開始できます。</div>':''}${setup}${kick}`;
  if (isHost()) {
    $('presetSelect').onchange = e => { const s=structuredClone(state.setup); s.preset=e.target.value; action('updateSetup',{setup:s}); };
    mainContent.querySelectorAll('[data-role]').forEach(el => el.onchange = () => { const s=structuredClone(state.setup); s.custom[el.dataset.role]=el.checked; action('updateSetup',{setup:s}); });
    if ($('startGameBtn')) $('startGameBtn').onclick = () => action('startGame');
    mainContent.querySelectorAll('.remove-player').forEach(b => b.onclick=()=>action('removePlayer',{playerId:b.dataset.id}));
  }
}
function renderTeam() {
  const required = state.missionTeamSize;
  const boxes = state.players.map(p => `<label class="choice ${selectedTeam.has(p.id)?'selected':''} ${!isLeader()?'disabled':''}"><input type="checkbox" data-id="${p.id}" ${selectedTeam.has(p.id)?'checked':''} ${!isLeader()?'disabled':''}><span>${escapeHtml(p.name)}</span></label>`).join('');
  mainContent.innerHTML = `<h2 class="section-title">Quest ${state.missionIndex+1} — Team Building</h2><p class="lead">リーダー <b>${escapeHtml(playerName(state.leaderId))}</b> が任務参加者を <b>${required} 人</b>選びます。</p>${state.missionRequires===2?'<div class="notice gold">この任務は失敗票が2票以上で失敗します。</div>':''}<div class="choice-grid">${boxes}</div>${isLeader()?'<div class="actions"><button id="proposeBtn" class="btn primary">このチームを提案</button></div>':'<div class="notice">リーダーの提案を待っています。</div>'}`;
  if (isLeader()) {
    mainContent.querySelectorAll('input[data-id]').forEach(inp => inp.onchange = () => {
      if (inp.checked) selectedTeam.add(inp.dataset.id); else selectedTeam.delete(inp.dataset.id);
      if (selectedTeam.size > required) { selectedTeam.delete(inp.dataset.id); inp.checked=false; toast(`${required}人まで選択できます。`); }
      renderTeam();
    });
    $('proposeBtn').onclick = () => action('proposeTeam',{playerIds:[...selectedTeam]});
  }
}
function renderVote() {
  const teamNames = state.selectedTeam.map(playerName).map(escapeHtml).join(' / ');
  let body = `<h2 class="section-title">Quest ${state.missionIndex+1} — Approval Vote</h2><p class="lead">提案チーム：<span class="mission-member">${teamNames}</span></p>`;
  if (state.voteResults) body += `<div class="vote-reveal">${state.voteResults.map(v=>`<div class="vote-chip ${v.approve?'approve':'reject'}"><b>${escapeHtml(playerName(v.id))}</b><br>${v.approve?'承認':'否認'}</div>`).join('')}</div>`;
  if (state.voteSubmitted) body += '<div class="notice good">投票済みです。他のプレイヤーを待っています。</div>';
  else body += '<div class="vote-buttons"><button id="approveBtn" class="btn success">承認</button><button id="rejectBtn" class="btn danger">否認</button></div>';
  mainContent.innerHTML = body;
  if (!state.voteSubmitted) { $('approveBtn').onclick=()=>action('voteTeam',{approve:true}); $('rejectBtn').onclick=()=>action('voteTeam',{approve:false}); }
}
function renderMissionVote() {
  const teamNames = state.selectedTeam.map(playerName).map(escapeHtml).join(' / ');
  let body = `<h2 class="section-title">Quest ${state.missionIndex+1} — Mission</h2><p class="lead">任務参加者：<span class="mission-member">${teamNames}</span></p>`;
  if (!state.isOnMission) body += '<div class="notice">あなたは今回の任務には参加していません。結果を待っています。</div>';
  else if (state.missionSubmitted) body += '<div class="notice good">送信済みです。他の任務参加者を待っています。</div>';
  else {
    const isGood = state.me.roleMeta?.team === 'good';
    body += `<p class="tiny muted">選択内容は個別には公開されません。結果では失敗票の枚数だけ表示されます。</p><div class="vote-buttons"><button id="missionSuccessBtn" class="btn success">任務成功</button><button id="missionFailBtn" class="btn danger" ${isGood?'disabled':''}>任務失敗</button></div>${isGood?'<div class="notice good">善陣営は「任務成功」のみ選べます。</div>':''}`;
  }
  mainContent.innerHTML = body;
  if (state.isOnMission && !state.missionSubmitted) { $('missionSuccessBtn').onclick=()=>action('missionVote',{success:true}); if($('missionFailBtn')) $('missionFailBtn').onclick=()=>action('missionVote',{success:false}); }
}
function renderAssassination() {
  const isAssassin = state.me.role === 'assassin';
  let body = '<h2 class="section-title">Assassination</h2><div class="notice gold">善陣営は3つの任務を成功させました。しかし暗殺者がマーリンを見抜けば悪陣営の逆転勝利です。</div>';
  if (isAssassin) body += `<p class="lead">マーリンだと思うプレイヤーを1人選んでください。</p><div class="choice-grid">${state.players.filter(p=>p.id!==state.me.id).map(p=>`<button class="btn assassinate" data-id="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div>`;
  else body += '<div class="notice">暗殺者が対象を選んでいます。</div>';
  mainContent.innerHTML=body;
  if(isAssassin) mainContent.querySelectorAll('.assassinate').forEach(b=>b.onclick=()=>{ if(confirm(`${playerName(b.dataset.id)} を暗殺しますか？`)) action('assassinate',{playerId:b.dataset.id}); });
}
function renderGameover() {
  const good = state.winner==='good';
  const reveal = state.players.map(p=>`<div class="reveal-card"><div class="rname">${escapeHtml(p.name)}</div><div class="rrole ${p.team==='good'?'team-good':'team-evil'}">${escapeHtml(roleName(p.role))} / ${p.team==='good'?'善陣営':'悪陣営'}</div></div>`).join('');
  mainContent.innerHTML = `<div class="result-title ${good?'good':'evil'}">${good?'善陣営の勝利':'悪陣営の勝利'}</div><p class="lead" style="text-align:center">${escapeHtml(state.winnerReason||'')}</p><div class="role-reveal">${reveal}</div>${isHost()?'<div class="actions"><button id="restartBtn" class="btn primary">ロビーに戻って再戦</button></div>':''}`;
  if(isHost()) $('restartBtn').onclick=()=>action('restartGame');
}
function renderLog() {
  $('logList').innerHTML = (state.log||[]).slice().reverse().map(l=>`<div class="log-item">${escapeHtml(l.text)}</div>`).join('') || '<div class="muted">ログはまだありません。</div>';
}
