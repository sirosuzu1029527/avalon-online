const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const rooms = new Map();

const MISSION_CONFIG = {
  5: { evil: 2, team: [2, 3, 2, 3, 3] },
  6: { evil: 2, team: [2, 3, 4, 3, 4] },
  7: { evil: 3, team: [2, 3, 3, 4, 4] },
  8: { evil: 3, team: [3, 4, 4, 5, 5] },
  9: { evil: 3, team: [3, 4, 4, 5, 5] },
 10: { evil: 4, team: [3, 4, 4, 5, 5] }
};

const ROLE_META = {
  merlin:   { name: 'マーリン', team: 'good', desc: 'モードレッド以外の悪陣営を知る。正体を暗殺者に悟られないようにする。' },
  percival: { name: 'パーシヴァル', team: 'good', desc: 'マーリンとモルガナの候補を知るが、どちらが本物かは分からない。' },
  loyal:    { name: 'アーサーの忠臣', team: 'good', desc: '特殊情報を持たない善陣営。' },
  assassin: { name: '暗殺者', team: 'evil', desc: '善陣営が任務を3回成功させた後、マーリンを当てれば逆転勝利できる。' },
  morgana:  { name: 'モルガナ', team: 'evil', desc: 'パーシヴァルにはマーリン候補として見える。' },
  mordred:  { name: 'モードレッド', team: 'evil', desc: 'マーリンから正体が見えない。' },
  oberon:   { name: 'オベロン', team: 'evil', desc: '他の悪陣営から見えず、自分も他の悪陣営を知らない。' },
  minion:   { name: 'モードレッドの手下', team: 'evil', desc: '特殊能力を持たない悪陣営。' }
};

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate room code');
}
function sanitizeName(v) { return String(v || '').trim().replace(/[<>]/g, '').slice(0, 20); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function defaultRoles(n) {
  const config = MISSION_CONFIG[n]; if (!config) throw new Error('5〜10人でプレイしてください。');
  const goodCount = n - config.evil;
  const good = ['merlin', 'percival']; while (good.length < goodCount) good.push('loyal');
  let evil = n <= 6 ? ['assassin', 'morgana'] : n <= 9 ? ['assassin', 'morgana', 'mordred'] : ['assassin', 'morgana', 'mordred', 'oberon'];
  while (evil.length < config.evil) evil.push('minion');
  return [...good, ...evil];
}
function simpleRoles(n) {
  const config = MISSION_CONFIG[n]; if (!config) throw new Error('5〜10人でプレイしてください。');
  const roles = ['merlin']; while (roles.length < n - config.evil) roles.push('loyal');
  roles.push('assassin'); while (roles.length < n) roles.push('minion'); return roles;
}
function customRoles(n, selected = {}) {
  const config = MISSION_CONFIG[n]; if (!config) throw new Error('5〜10人でプレイしてください。');
  const goodCount = n - config.evil;
  const goodSpecial = ['merlin', 'percival'].filter(r => selected[r]);
  const evilSpecial = ['assassin', 'morgana', 'mordred', 'oberon'].filter(r => selected[r]);
  if (goodSpecial.length > goodCount) throw new Error('善陣営の特殊役職が多すぎます。');
  if (evilSpecial.length > config.evil) throw new Error('悪陣営の特殊役職が多すぎます。');
  if (selected.merlin && !selected.assassin) throw new Error('マーリンを使用する場合は暗殺者も使用してください。');
  const roles = [...goodSpecial]; while (roles.length < goodCount) roles.push('loyal');
  roles.push(...evilSpecial); while (roles.length < n) roles.push('minion'); return roles;
}
function getPlayer(room, token) { return room.players.find(p => p.token === token); }
function roleKnowledge(room, viewer) {
  if (!viewer.role) return [];
  const players = room.players, lines = [], role = viewer.role;
  if (role === 'merlin') lines.push({ label: '見えている悪陣営', playerIds: players.filter(p => ROLE_META[p.role]?.team === 'evil' && p.role !== 'mordred').map(p => p.id) });
  if (role === 'percival') lines.push({ label: 'マーリン候補', playerIds: shuffle(players.filter(p => p.role === 'merlin' || p.role === 'morgana').map(p => p.id)) });
  if (ROLE_META[role]?.team === 'evil' && role !== 'oberon') lines.push({ label: '仲間の悪陣営', playerIds: players.filter(p => p.id !== viewer.id && ROLE_META[p.role]?.team === 'evil' && p.role !== 'oberon').map(p => p.id) });
  if (role === 'oberon') lines.push({ label: '特殊情報', text: 'オベロンなので、他の悪陣営は分かりません。' });
  return lines;
}
function publicState(room, viewer) {
  const returnedToLobby = !!viewer && room.phase === 'rematch' && room.returnedPlayers.has(viewer.id);
  const effectivePhase = room.phase === 'rematch' ? (returnedToLobby ? 'lobby' : 'gameover') : room.phase;
  const revealRoles = effectivePhase === 'gameover';
  const visiblePlayers = returnedToLobby ? room.players.filter(p => room.returnedPlayers.has(p.id)) : room.players;
  const cfg = visiblePlayers.length >= 5 ? MISSION_CONFIG[visiblePlayers.length] : null;
  return {
    code: room.code, hostId: room.hostId, createdAt: room.createdAt, phase: effectivePhase,
    rematchOpen: room.phase === 'rematch', returnedToLobby,
    players: visiblePlayers.map(p => ({ id:p.id, name:p.name, connected:!!p.connected, isHost:p.id===room.hostId, role:revealRoles?p.role:undefined, team:revealRoles&&p.role?ROLE_META[p.role].team:undefined })),
    me: viewer ? { id:viewer.id, name:viewer.name, role:effectivePhase==='lobby'?null:(viewer.role||null), roleMeta:effectivePhase==='lobby'?null:(viewer.role?ROLE_META[viewer.role]:null), knowledge:effectivePhase==='lobby'?[]:(viewer.role?roleKnowledge(room,viewer):[]) } : null,
    setup: room.setup, leaderId: room.leaderId, selectedTeam:[...room.selectedTeam], missionIndex:room.missionIndex,
    missionTeamSize: cfg && room.missionIndex < 5 ? cfg.team[room.missionIndex] : null,
    missionRequires: cfg && room.missionIndex===3 && visiblePlayers.length>=7 ? 2 : 1,
    missions:room.missions, proposalNumber:room.proposalNumber, rejectionCount:room.rejectionCount,
    voteSubmitted:viewer?room.votes.has(viewer.id):false, voteResults:room.voteResults,
    missionSubmitted:viewer?room.missionVotes.has(viewer.id):false, isOnMission:viewer?room.selectedTeam.includes(viewer.id):false,
    goodMissionSuccesses:room.missions.filter(m=>m&&m.success).length, evilMissionSuccesses:room.missions.filter(m=>m&&!m.success).length,
    winner:room.winner, winnerReason:room.winnerReason, log:room.log.slice(-40), assassinationTargetId:room.assassinationTargetId||null
  };
}
function sseWrite(res, payload) { try { res.write(`data: ${JSON.stringify(payload)}\n\n`); return true; } catch { return false; } }
function publish(room) {
  room.updatedAt = Date.now();
  for (const p of room.players) if (p.stream) sseWrite(p.stream, { type:'roomState', data:publicState(room,p) });
}
function log(room,text){room.log.push({at:Date.now(),text});}
function rotateLeader(room){if(!room.players.length)return; const i=room.players.findIndex(p=>p.id===room.leaderId); room.leaderId=room.players[(i+1+room.players.length)%room.players.length].id;}
function resetGameFields(room){room.phase='lobby';room.returnedPlayers=new Set();room.leaderId=null;room.selectedTeam=[];room.missionIndex=0;room.missions=[null,null,null,null,null];room.proposalNumber=0;room.rejectionCount=0;room.votes=new Map();room.voteResults=null;room.missionVotes=new Map();room.winner=null;room.winnerReason=null;room.assassinationTargetId=null;for(const p of room.players)p.role=null;}
function finish(room,winner,reason){room.phase='gameover';room.returnedPlayers=new Set();room.winner=winner;room.winnerReason=reason;log(room,`${winner==='good'?'善':'悪'}陣営の勝利：${reason}`);}
function endGameByHost(room,player){ensureHost(room,player);if(room.phase==='lobby')throw new Error('ゲーム開始前です。');if(room.phase==='gameover'||room.phase==='rematch')throw new Error('ゲームはすでに終了しています。');room.phase='gameover';room.returnedPlayers=new Set();room.winner=null;room.winnerReason='ホストがゲームを終了しました。';log(room,`${player.name}（ホスト）がゲームを終了しました。`);}
function ensureHost(room,player){if(!player||room.hostId!==player.id)throw new Error('ホストのみ実行できます。');}
function isLobbyPlayer(room,p){return room.phase==='lobby'||(room.phase==='rematch'&&room.returnedPlayers.has(p.id));}
function excludeNonReturnedPlayers(room){
  if(room.phase!=='rematch')return;
  const excluded=room.players.filter(p=>!room.returnedPlayers.has(p.id));
  for(const p of excluded){
    p.removed=true;
    if(p.disconnectTimer)clearTimeout(p.disconnectTimer);
    if(p.stream){sseWrite(p.stream,{type:'rematchExcluded'});try{p.stream.end();}catch{}}
  }
  room.players=room.players.filter(p=>room.returnedPlayers.has(p.id));
  room.returnedPlayers=new Set(room.players.map(p=>p.id));
}

function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});res.end(body);}
function readJson(req){return new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>1_000_000){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function newRoom(name,token){
  const code=makeCode(); const p={id:crypto.randomUUID(),token,name,connected:false,role:null,stream:null,disconnectTimer:null,removed:false};
  const room={code,hostId:p.id,players:[p],phase:'lobby',returnedPlayers:new Set(),setup:{preset:'standard',custom:{merlin:true,percival:true,assassin:true,morgana:true,mordred:true,oberon:true}},leaderId:null,selectedTeam:[],missionIndex:0,missions:[null,null,null,null,null],proposalNumber:0,rejectionCount:0,votes:new Map(),voteResults:null,missionVotes:new Map(),winner:null,winnerReason:null,assassinationTargetId:null,log:[],createdAt:Date.now(),updatedAt:Date.now()};
  rooms.set(code,room); log(room,`${name} が部屋を作成しました。`); return room;
}

async function handleApi(req,res,url){
  try {
    if(req.method==='POST' && url.pathname==='/api/create'){
      const b=await readJson(req); const name=sanitizeName(b.name), token=String(b.token||crypto.randomUUID()); if(!name)throw new Error('表示名を入力してください。');
      const room=newRoom(name,token); return json(res,200,{ok:true,code:room.code,token});
    }
    if(req.method==='POST' && url.pathname==='/api/join'){
      const b=await readJson(req); const code=String(b.code||'').trim().toUpperCase(), name=sanitizeName(b.name), token=String(b.token||crypto.randomUUID());
      const room=rooms.get(code); if(!room)throw new Error('部屋が見つかりません。コードを確認してください。');
      let p=getPlayer(room,token);
      if(p){ if(name)p.name=name; }
      else { if(room.phase!=='lobby')throw new Error('ゲーム開始後は新規参加できません。'); if(room.players.length>=10)throw new Error('この版では最大10人です。'); if(!name)throw new Error('表示名を入力してください。'); p={id:crypto.randomUUID(),token,name,connected:false,role:null,stream:null,disconnectTimer:null,removed:false}; room.players.push(p); log(room,`${name} が参加しました。`); }
      room.updatedAt=Date.now(); publish(room); return json(res,200,{ok:true,code,token});
    }
    if(req.method==='GET' && url.pathname==='/api/events'){
      const code=String(url.searchParams.get('code')||'').toUpperCase(), token=String(url.searchParams.get('token')||'');
      const room=rooms.get(code), p=room&&getPlayer(room,token); if(!room||!p){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.write(': connected\n\n');
      if(p.disconnectTimer){clearTimeout(p.disconnectTimer);p.disconnectTimer=null;} if(p.stream&&p.stream!==res){try{p.stream.end();}catch{}}
      p.stream=res; p.connected=true; sseWrite(res,{type:'roomState',data:publicState(room,p)}); publish(room);
      const heartbeat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},20000);
      req.on('close',()=>{clearInterval(heartbeat); if(p.removed)return; if(p.stream===res)p.stream=null; p.disconnectTimer=setTimeout(()=>{if(!p.stream&&!p.removed){p.connected=false;log(room,`${p.name} が切断しました。再接続を待っています。`);publish(room);}},3000);}); return;
    }
    if(req.method==='POST' && url.pathname==='/api/action'){
      const b=await readJson(req); const room=rooms.get(String(b.code||'').toUpperCase()); if(!room)throw new Error('部屋が見つかりません。'); const p=getPlayer(room,String(b.token||'')); if(!p)throw new Error('参加情報が無効です。');
      const type=String(b.type||''), x=b.payload||{};
      if(type==='updateSetup'){
        ensureHost(room,p); if(!isLobbyPlayer(room,p))throw new Error('ロビーでのみ変更できます。'); const s=x.setup||{}; const preset=['standard','simple','custom'].includes(s.preset)?s.preset:'standard'; room.setup={preset,custom:{merlin:!!s.custom?.merlin,percival:!!s.custom?.percival,assassin:!!s.custom?.assassin,morgana:!!s.custom?.morgana,mordred:!!s.custom?.mordred,oberon:!!s.custom?.oberon}};
      } else if(type==='removePlayer'){
        ensureHost(room,p); if(!isLobbyPlayer(room,p))throw new Error('ロビーでのみ削除できます。'); if(x.playerId===room.hostId)throw new Error('ホスト自身は削除できません。'); const t=room.players.find(q=>q.id===x.playerId); if(t){t.removed=true;if(t.disconnectTimer)clearTimeout(t.disconnectTimer);if(t.stream){sseWrite(t.stream,{type:'kicked'});try{t.stream.end();}catch{}}room.players=room.players.filter(q=>q.id!==t.id);room.returnedPlayers.delete(t.id);log(room,`${t.name} を部屋から削除しました。`);}
      } else if(type==='startGame'){
        ensureHost(room,p); if(!isLobbyPlayer(room,p))throw new Error('ロビーから開始してください。');
        if(room.phase==='rematch')excludeNonReturnedPlayers(room);
        const n=room.players.length;if(!MISSION_CONFIG[n])throw new Error('ロビーに戻った参加者が5〜10人そろうと開始できます。'); if(room.players.some(q=>!q.connected))throw new Error('切断中のプレイヤーがいます。削除するか再接続を待ってください。');
        let roles=room.setup.preset==='simple'?simpleRoles(n):room.setup.preset==='custom'?customRoles(n,room.setup.custom):defaultRoles(n);roles=shuffle(roles);room.players.forEach((q,i)=>q.role=roles[i]);room.players=shuffle(room.players);room.leaderId=room.players[crypto.randomInt(room.players.length)].id;room.phase='team';room.returnedPlayers=new Set();room.selectedTeam=[];room.missionIndex=0;room.missions=[null,null,null,null,null];room.proposalNumber=1;room.rejectionCount=0;room.votes=new Map();room.voteResults=null;room.missionVotes=new Map();room.winner=null;room.winnerReason=null;room.assassinationTargetId=null;room.log=[];log(room,'ゲームを開始しました。');log(room,`${room.players.find(q=>q.id===room.leaderId).name} が最初のリーダーです。`);
      } else if(type==='proposeTeam'){
        if(room.phase!=='team')throw new Error('現在はチーム編成フェーズではありません。'); if(p.id!==room.leaderId)throw new Error('現在のリーダーのみ編成できます。'); const required=MISSION_CONFIG[room.players.length].team[room.missionIndex]; const unique=[...new Set(Array.isArray(x.playerIds)?x.playerIds:[])]; if(unique.length!==required)throw new Error(`任務メンバーを ${required} 人選んでください。`); if(unique.some(id=>!room.players.some(q=>q.id===id)))throw new Error('無効なプレイヤーが含まれています。'); room.selectedTeam=unique;room.votes=new Map();room.voteResults=null;room.phase='vote';log(room,`${p.name} が任務チームを提案しました。`);
      } else if(type==='voteTeam'){
        if(room.phase!=='vote')throw new Error('現在は投票フェーズではありません。');if(room.votes.has(p.id))throw new Error('すでに投票済みです。');room.votes.set(p.id,!!x.approve);if(room.votes.size===room.players.length){const approvals=[...room.votes.values()].filter(Boolean).length,rejects=room.players.length-approvals;room.voteResults=room.players.map(q=>({id:q.id,approve:room.votes.get(q.id)}));if(approvals>rejects){room.phase='mission';room.missionVotes=new Map();room.rejectionCount=0;log(room,`チームが承認されました（承認 ${approvals} / 否認 ${rejects}）。`);}else{room.rejectionCount++;log(room,`チームは否認されました（承認 ${approvals} / 否認 ${rejects}）。`);if(room.rejectionCount>=5)finish(room,'evil','5回連続でチーム編成が否認された');else{rotateLeader(room);room.proposalNumber++;room.selectedTeam=[];room.votes=new Map();room.phase='team';}}}
      } else if(type==='missionVote'){
        if(room.phase!=='mission')throw new Error('現在は任務フェーズではありません。');if(!room.selectedTeam.includes(p.id))throw new Error('任務参加者のみ選択できます。');if(room.missionVotes.has(p.id))throw new Error('すでに任務結果を送信済みです。');const isGood=ROLE_META[p.role]?.team==='good';if(isGood&&!x.success)throw new Error('善陣営は任務成功のみ選択できます。');room.missionVotes.set(p.id,!!x.success);if(room.missionVotes.size===room.selectedTeam.length){const failCount=[...room.missionVotes.values()].filter(v=>!v).length,requiredFails=room.missionIndex===3&&room.players.length>=7?2:1,success=failCount<requiredFails;room.missions[room.missionIndex]={index:room.missionIndex,team:[...room.selectedTeam],success,failCount,requiredFails};log(room,`第${room.missionIndex+1}任務は${success?'成功':'失敗'}（失敗票 ${failCount}）。`);const gs=room.missions.filter(m=>m?.success).length,es=room.missions.filter(m=>m&&!m.success).length;if(es>=3)finish(room,'evil','任務を3回失敗させた');else if(gs>=3){const merlin=room.players.find(q=>q.role==='merlin'),assassin=room.players.find(q=>q.role==='assassin');if(merlin&&assassin){room.phase='assassination';room.selectedTeam=[];log(room,'善陣営が任務を3回成功。暗殺フェーズに移ります。');}else finish(room,'good','任務を3回成功させた');}else{room.missionIndex++;room.selectedTeam=[];room.missionVotes=new Map();room.votes=new Map();room.voteResults=null;room.proposalNumber++;rotateLeader(room);room.phase='team';}}
      } else if(type==='assassinate'){
        if(room.phase!=='assassination')throw new Error('現在は暗殺フェーズではありません。');if(p.role!=='assassin')throw new Error('暗殺者のみ実行できます。');const t=room.players.find(q=>q.id===x.playerId);if(!t)throw new Error('対象が見つかりません。');room.assassinationTargetId=t.id;if(t.role==='merlin')finish(room,'evil',`${t.name}（マーリン）の暗殺に成功した`);else finish(room,'good',`${t.name} を暗殺したがマーリンではなかった`);
      } else if(type==='endGame'){
        endGameByHost(room,p);
      } else if(type==='restartGame'){
        ensureHost(room,p); if(room.phase!=='gameover')throw new Error('ゲーム終了後に実行できます。'); room.phase='rematch'; room.returnedPlayers=new Set([p.id]); log(room,'ホストが再戦ロビーを開きました。');
      } else if(type==='returnToLobby'){
        if(room.phase!=='rematch')throw new Error('ホストが再戦ロビーを開くまで戻れません。'); room.returnedPlayers.add(p.id); log(room,`${p.name} がロビーに戻りました。`);
        if(room.returnedPlayers.size===room.players.length){resetGameFields(room);room.log=[];log(room,'全員がロビーに戻りました。');}
      } else if(type==='leaveRoom'){
        if(!isLobbyPlayer(room,p))throw new Error('ゲーム中は退出できません。ブラウザを閉じた場合は同じ端末から再接続できます。');
        const leavingName=p.name; p.removed=true; if(p.disconnectTimer)clearTimeout(p.disconnectTimer); if(p.stream){try{p.stream.end();}catch{}} room.players=room.players.filter(q=>q.id!==p.id);room.returnedPlayers.delete(p.id);
        if(room.hostId===p.id && room.players.length){const nextHost=room.players.find(q=>room.phase!=='rematch'||room.returnedPlayers.has(q.id))||room.players[0];room.hostId=nextHost.id;}
        if(room.players.length)log(room,`${leavingName} が退出しました。`); else rooms.delete(room.code);
      } else throw new Error('不明な操作です。');
      publish(room); return json(res,200,{ok:true});
    }
    json(res,404,{ok:false,message:'Not found'});
  } catch(e){ json(res,400,{ok:false,message:e.message||'操作に失敗しました。'}); }
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname); if(rel==='/')rel='/index.html'; const file=path.normalize(path.join(PUBLIC_DIR,rel)); if(!file.startsWith(PUBLIC_DIR)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(file,(err,st)=>{if(err||!st.isFile()){const index=path.join(PUBLIC_DIR,'index.html');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(index).pipe(res);}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});fs.createReadStream(file).pipe(res);});
}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/health')return json(res,200,{ok:true,rooms:rooms.size});
  if(url.pathname.startsWith('/api/'))return handleApi(req,res,url);
  serveStatic(req,res,url);
});

setInterval(()=>{const cutoff=Date.now()-6*60*60*1000;for(const[code,room]of rooms)if(room.updatedAt<cutoff){for(const p of room.players)try{p.stream?.end();}catch{}rooms.delete(code);}},60*60*1000).unref();

if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`Avalon Online running on http://0.0.0.0:${PORT}`));
module.exports={server,rooms,MISSION_CONFIG,ROLE_META,defaultRoles,simpleRoles,customRoles,publicState,roleKnowledge};