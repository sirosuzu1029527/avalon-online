const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const rooms = new Map();

const QUEST_CONFIG = {
  5: { evil: 2, team: [2, 3, 2, 3, 3] },
  6: { evil: 2, team: [2, 3, 4, 3, 4] },
  7: { evil: 3, team: [2, 3, 3, 4, 4] },
  8: { evil: 3, team: [3, 4, 4, 5, 5] },
  9: { evil: 3, team: [3, 4, 4, 5, 5] },
 10: { evil: 4, team: [3, 4, 4, 5, 5] }
};

const TIMER_DEFAULTS = Object.freeze({ enabled:true, team:120, vote:30, result:20, quest:30, assassination:120 });

const ROLE_META = {
  merlin:   { name:'マーリン', team:'good', desc:'モードレッド以外の悪陣営を知る。正体を暗殺者に悟られないようにする。' },
  percival: { name:'パーシヴァル', team:'good', desc:'マーリンとモルガナの候補を知るが、どちらが本物かは分からない。' },
  loyal:    { name:'アーサーの忠臣', team:'good', desc:'特殊情報を持たない善陣営。' },
  assassin: { name:'暗殺者', team:'evil', desc:'善陣営がクエストを3回成功させた後、マーリンを当てれば逆転勝利できる。' },
  morgana:  { name:'モルガナ', team:'evil', desc:'パーシヴァルにはマーリン候補として見える。' },
  mordred:  { name:'モードレッド', team:'evil', desc:'マーリンから正体が見えない。' },
  oberon:   { name:'オベロン', team:'evil', desc:'他の悪陣営から見えず、自分も他の悪陣営を知らない。' },
  minion:   { name:'モードレッドの手下', team:'evil', desc:'特殊能力を持たない悪陣営。' }
};

function makeCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let k=0;k<1000;k++){let c='';for(let i=0;i<5;i++)c+=a[Math.floor(Math.random()*a.length)];if(!rooms.has(c))return c;}throw new Error('Could not allocate room code');}
function sanitizeName(v){return String(v||'').trim().replace(/[<>]/g,'').slice(0,20);}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function defaultRoles(n){const c=QUEST_CONFIG[n];if(!c)throw new Error('5〜10人でプレイしてください。');const good=['merlin','percival'];while(good.length<n-c.evil)good.push('loyal');let evil=n<=6?['assassin','morgana']:n<=9?['assassin','morgana','mordred']:['assassin','morgana','mordred','oberon'];while(evil.length<c.evil)evil.push('minion');return [...good,...evil];}
function simpleRoles(n){const c=QUEST_CONFIG[n];if(!c)throw new Error('5〜10人でプレイしてください。');const r=['merlin'];while(r.length<n-c.evil)r.push('loyal');r.push('assassin');while(r.length<n)r.push('minion');return r;}
function customRoles(n,s={}){const c=QUEST_CONFIG[n];if(!c)throw new Error('5〜10人でプレイしてください。');const gc=n-c.evil,g=['merlin','percival'].filter(r=>s[r]),e=['assassin','morgana','mordred','oberon'].filter(r=>s[r]);if(g.length>gc)throw new Error('善陣営の特殊役職が多すぎます。');if(e.length>c.evil)throw new Error('悪陣営の特殊役職が多すぎます。');if(s.merlin&&!s.assassin)throw new Error('マーリンを使用する場合は暗殺者も使用してください。');const r=[...g];while(r.length<gc)r.push('loyal');r.push(...e);while(r.length<n)r.push('minion');return r;}

function makeParticipant(name,token){return {id:crypto.randomUUID(),token,name,connected:false,stream:null,disconnectTimer:null,hostTransferTimer:null,removed:false};}
function makePlayer(name,token){return {...makeParticipant(name,token),role:null};}
function getPlayer(room,token){return room.players.find(p=>p.token===token);}
function getSpectator(room,token){return room.spectators.find(p=>p.token===token);}
function getParticipant(room,token){return getPlayer(room,token)||getSpectator(room,token);}
function isSpectator(room,p){return !!p&&room.spectators.some(s=>s.id===p.id);}
function roleKnowledge(room,viewer){if(!viewer.role)return[];const ps=room.players,l=[],r=viewer.role;if(r==='merlin')l.push({label:'見えている悪陣営',playerIds:ps.filter(p=>ROLE_META[p.role]?.team==='evil'&&p.role!=='mordred').map(p=>p.id)});if(r==='percival')l.push({label:'マーリン候補',playerIds:shuffle(ps.filter(p=>p.role==='merlin'||p.role==='morgana').map(p=>p.id))});if(ROLE_META[r]?.team==='evil'&&r!=='oberon')l.push({label:'仲間の悪陣営',playerIds:ps.filter(p=>p.id!==viewer.id&&ROLE_META[p.role]?.team==='evil'&&p.role!=='oberon').map(p=>p.id)});if(r==='oberon')l.push({label:'特殊情報',text:'オベロンなので、他の悪陣営は分かりません。'});return l;}

function validateTimerSeconds(v){const n=Number(v);if(!Number.isInteger(n)||n<1||n>3600)throw new Error('タイマーは1〜3600秒で設定してください。');return n;}
function timerDurationForPhase(room,phase){if(!room.timerSettings?.enabled)return null;if(phase==='team')return room.timerSettings.team;if(phase==='vote')return room.timerSettings.vote;if(phase==='vote_result'||phase==='quest_result')return room.timerSettings.result;if(phase==='quest')return room.timerSettings.quest;if(phase==='assassination')return room.timerSettings.assassination;return null;}
function clearTimer(room){room.timer={phase:null,endsAt:null,pausedRemainingSeconds:null};}
function startPhaseTimer(room,phase,now=Date.now()){const sec=timerDurationForPhase(room,phase);if(sec==null){clearTimer(room);return;}room.timer={phase,endsAt:now+sec*1000,pausedRemainingSeconds:null};}
function setPhase(room,phase){room.phase=phase;startPhaseTimer(room,phase);}
function ensureTimerControllable(room){if(!room.timerSettings?.enabled||timerDurationForPhase(room,room.phase)==null)throw new Error('現在のフェーズではタイマーを使用できません。');if(room.timer.phase!==room.phase)startPhaseTimer(room,room.phase);}

function spectatorSecrets(room){
  return {
    players:room.players.map(p=>({id:p.id,role:p.role||null,team:p.role?ROLE_META[p.role]?.team:null,roleMeta:p.role?ROLE_META[p.role]:null})),
    liveVotes:room.players.map(p=>({id:p.id,submitted:room.votes.has(p.id),approve:room.votes.has(p.id)?room.votes.get(p.id):null})),
    liveQuestVotes:room.selectedTeam.map(id=>({id,submitted:room.questVotes.has(id),success:room.questVotes.has(id)?room.questVotes.get(id):null})),
    merlinId:room.players.find(p=>p.role==='merlin')?.id||null,
    assassinationTargetId:room.assassinationTargetId||null
  };
}
function publicState(room,viewer){
  const spectator=isSpectator(room,viewer);
  const returnedToLobby=!spectator&&!!viewer&&room.phase==='rematch'&&room.returnedPlayers.has(viewer.id);
  const effectivePhase=room.phase==='rematch'?(spectator||returnedToLobby?'lobby':'gameover'):room.phase;
  const revealRoles=effectivePhase==='gameover';
  const visiblePlayers=room.phase==='rematch'&&(spectator||returnedToLobby)?room.players.filter(p=>room.returnedPlayers.has(p.id)):room.players;
  const cfg=visiblePlayers.length>=5?QUEST_CONFIG[visiblePlayers.length]:null;
  const voteApprovals=room.voteResults?room.voteResults.filter(v=>v.approve).length:0,voteRejects=room.voteResults?room.voteResults.length-voteApprovals:0;
  const state={
    code:room.code,hostId:room.hostId,createdAt:room.createdAt,phase:effectivePhase,rematchOpen:room.phase==='rematch',returnedToLobby,
    players:visiblePlayers.map(p=>({id:p.id,name:p.name,connected:!!p.connected,isHost:p.id===room.hostId,role:revealRoles?p.role:undefined,team:revealRoles&&p.role?ROLE_META[p.role].team:undefined})),
    spectators:room.spectators.map(s=>({id:s.id,name:s.name,connected:!!s.connected})),
    me:viewer?{id:viewer.id,name:viewer.name,isSpectator:spectator,role:spectator||effectivePhase==='lobby'?null:(viewer.role||null),roleMeta:spectator||effectivePhase==='lobby'?null:(viewer.role?ROLE_META[viewer.role]:null),knowledge:spectator||effectivePhase==='lobby'?[]:(viewer.role?roleKnowledge(room,viewer):[])}:null,
    setup:room.setup,timerSettings:{...room.timerSettings},timer:{...room.timer},serverNow:Date.now(),leaderId:room.leaderId,selectedTeam:[...room.selectedTeam],questIndex:room.questIndex,
    questTeamSize:cfg&&room.questIndex<5?cfg.team[room.questIndex]:null,questRequires:cfg&&room.questIndex===3&&visiblePlayers.length>=7?2:1,
    quests:room.quests,proposalNumber:room.proposalNumber,rejectionCount:room.rejectionCount,
    voteSubmitted:!spectator&&viewer?room.votes.has(viewer.id):false,voteResults:room.voteResults,voteOutcome:room.phase==='vote_result'&&room.voteResults?{approvals:voteApprovals,rejects:voteRejects,approved:voteApprovals>voteRejects}:null,
    questSubmitted:!spectator&&viewer?room.questVotes.has(viewer.id):false,isOnQuest:!spectator&&viewer?room.selectedTeam.includes(viewer.id):false,questOutcome:room.phase==='quest_result'?room.quests[room.questIndex]:null,
    resultConfirmed:!spectator&&viewer?room.confirmations.has(viewer.id):false,resultConfirmationCount:room.confirmations.size,resultConfirmationTotal:room.players.length,
    resultUnconfirmedPlayerIds:viewer&&viewer.id===room.hostId?room.players.filter(p=>!room.confirmations.has(p.id)).map(p=>p.id):[],
    goodQuestSuccesses:room.quests.filter(q=>q&&q.success).length,evilQuestSuccesses:room.quests.filter(q=>q&&!q.success).length,winner:room.winner,winnerReason:room.winnerReason,log:room.log.slice(-40),assassinationTargetId:room.assassinationTargetId||null
  };
  if(spectator)state.spectatorSecrets=spectatorSecrets(room);
  return state;
}
function sseWrite(res,payload){try{res.write(`data: ${JSON.stringify(payload)}\n\n`);return true;}catch{return false;}}
function publish(room){room.updatedAt=Date.now();for(const p of [...room.players,...room.spectators])if(p.stream)sseWrite(p.stream,{type:'roomState',data:publicState(room,p)});}
function log(room,text){room.log.push({at:Date.now(),text});}
function rotateLeader(room){if(!room.players.length)return;const i=room.players.findIndex(p=>p.id===room.leaderId);room.leaderId=room.players[(i+1+room.players.length)%room.players.length].id;}
function clearResultState(room){room.confirmations=new Set();room.resultNextPhase=null;}
function resetGameFields(room){setPhase(room,'lobby');room.returnedPlayers=new Set();room.leaderId=null;room.selectedTeam=[];room.questIndex=0;room.quests=[null,null,null,null,null];room.proposalNumber=0;room.rejectionCount=0;room.votes=new Map();room.voteResults=null;room.questVotes=new Map();clearResultState(room);room.winner=null;room.winnerReason=null;room.assassinationTargetId=null;for(const p of room.players)p.role=null;}
function finish(room,winner,reason){setPhase(room,'gameover');room.returnedPlayers=new Set();clearResultState(room);room.winner=winner;room.winnerReason=reason;log(room,`${winner==='good'?'善':'悪'}陣営の勝利：${reason}`);}
function ensureHost(room,p){if(!p||room.hostId!==p.id)throw new Error('ホストのみ実行できます。');}
function endGameByHost(room,p){ensureHost(room,p);if(room.phase==='lobby')throw new Error('ゲーム開始前です。');if(room.phase==='gameover'||room.phase==='rematch')throw new Error('ゲームはすでに終了しています。');setPhase(room,'gameover');room.returnedPlayers=new Set();clearResultState(room);room.winner=null;room.winnerReason='ホストがゲームを終了しました。';log(room,`${p.name}（ホスト）がゲームを終了しました。`);}
function isLobbyPlayer(room,p){return room.phase==='lobby'||(room.phase==='rematch'&&room.returnedPlayers.has(p.id));}
function canSwitchParticipation(room,p){return room.phase==='lobby'||room.phase==='rematch'&&(isSpectator(room,p)||room.returnedPlayers.has(p.id));}
function isResultPhase(room){return room.phase==='vote_result'||room.phase==='quest_result';}
function beginResultPhase(room,phase,next){setPhase(room,phase);room.confirmations=new Set();room.resultNextPhase=next;}
function advanceResultPhase(room){if(!isResultPhase(room))throw new Error('現在は結果確認フェーズではありません。');const next=room.resultNextPhase;clearResultState(room);if(next==='quest'){setPhase(room,'quest');room.questVotes=new Map();room.rejectionCount=0;return;}if(next==='team_after_reject'){rotateLeader(room);room.proposalNumber++;room.selectedTeam=[];room.votes=new Map();room.voteResults=null;setPhase(room,'team');return;}if(next==='gameover_rejections'){finish(room,'evil','5回連続でチーム編成が否認された');return;}if(next==='team_after_quest'){room.questIndex++;room.selectedTeam=[];room.questVotes=new Map();room.votes=new Map();room.voteResults=null;room.proposalNumber++;rotateLeader(room);setPhase(room,'team');return;}if(next==='assassination'){room.selectedTeam=[];setPhase(room,'assassination');log(room,'善陣営がクエストを3回成功。暗殺フェーズに移ります。');return;}if(next==='gameover_evil_quests'){finish(room,'evil','クエストを3回失敗させた');return;}if(next==='gameover_good_quests'){finish(room,'good','クエストを3回成功させた');return;}throw new Error('次のフェーズが不正です。');}
function removeParticipant(room,p,messageType='kicked'){p.removed=true;if(p.disconnectTimer)clearTimeout(p.disconnectTimer);if(p.hostTransferTimer)clearTimeout(p.hostTransferTimer);if(p.stream){sseWrite(p.stream,{type:messageType});try{p.stream.end();}catch{}}}
function excludeNonReturnedPlayers(room){if(room.phase!=='rematch')return;const ex=room.players.filter(p=>!room.returnedPlayers.has(p.id));for(const p of ex)removeParticipant(room,p,'rematchExcluded');room.players=room.players.filter(p=>room.returnedPlayers.has(p.id));room.returnedPlayers=new Set(room.players.map(p=>p.id));}
function closeRoomIfNoPlayers(room){if(room.players.length)return false;for(const s of room.spectators){removeParticipant(room,s,'roomClosed');}rooms.delete(room.code);return true;}

function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});res.end(body);}
function readJson(req){return new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>1_000_000){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function newRoom(name,token){const p=makePlayer(name,token),code=makeCode();const room={code,hostId:p.id,players:[p],spectators:[],phase:'lobby',returnedPlayers:new Set(),setup:{preset:'standard',custom:{merlin:true,percival:true,assassin:true,morgana:true,mordred:true,oberon:true}},timerSettings:{...TIMER_DEFAULTS},timer:{phase:null,endsAt:null,pausedRemainingSeconds:null},leaderId:null,selectedTeam:[],questIndex:0,quests:[null,null,null,null,null],proposalNumber:0,rejectionCount:0,votes:new Map(),voteResults:null,questVotes:new Map(),confirmations:new Set(),resultNextPhase:null,winner:null,winnerReason:null,assassinationTargetId:null,log:[],createdAt:Date.now(),updatedAt:Date.now()};rooms.set(code,room);log(room,`${name} が部屋を作成しました。`);return room;}

async function handleApi(req,res,url){
  try{
    if(req.method==='POST'&&url.pathname==='/api/create'){const b=await readJson(req),name=sanitizeName(b.name),token=String(b.token||crypto.randomUUID());if(!name)throw new Error('表示名を入力してください。');const room=newRoom(name,token);return json(res,200,{ok:true,code:room.code,token});}
    if(req.method==='POST'&&url.pathname==='/api/join'){
      const b=await readJson(req),code=String(b.code||'').trim().toUpperCase(),name=sanitizeName(b.name),token=String(b.token||crypto.randomUUID()),room=rooms.get(code);if(!room)throw new Error('部屋が見つかりません。コードを確認してください。');
      let p=getParticipant(room,token);
      if(p){if(name)p.name=name;}
      else{if(!name)throw new Error('表示名を入力してください。');const joinAsPlayer=room.phase==='lobby'&&room.players.length<10;p=joinAsPlayer?makePlayer(name,token):makeParticipant(name,token);if(joinAsPlayer){room.players.push(p);log(room,`${name} が参加しました。`);}else{room.spectators.push(p);log(room,`${name} が観戦者として参加しました。`);}}
      room.updatedAt=Date.now();publish(room);return json(res,200,{ok:true,code,token});
    }
    if(req.method==='GET'&&url.pathname==='/api/events'){
      const code=String(url.searchParams.get('code')||'').toUpperCase(),token=String(url.searchParams.get('token')||''),room=rooms.get(code),p=room&&getParticipant(room,token);if(!room||!p){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');
      if(p.disconnectTimer){clearTimeout(p.disconnectTimer);p.disconnectTimer=null;}if(p.hostTransferTimer){clearTimeout(p.hostTransferTimer);p.hostTransferTimer=null;}if(p.stream&&p.stream!==res){try{p.stream.end();}catch{}}p.stream=res;p.connected=true;sseWrite(res,{type:'roomState',data:publicState(room,p)});publish(room);
      const heartbeat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},20000);
      req.on('close',()=>{clearInterval(heartbeat);if(p.removed)return;if(p.stream===res)p.stream=null;p.disconnectTimer=setTimeout(()=>{if(!p.stream&&!p.removed){p.connected=false;log(room,`${p.name} が切断しました。再接続を待っています。`);publish(room);}},3000);if(room.hostId===p.id){p.hostTransferTimer=setTimeout(()=>{p.hostTransferTimer=null;if(p.stream||p.removed||room.hostId!==p.id)return;const next=room.players.find(q=>q.id!==p.id&&q.connected&&!q.removed);if(next){room.hostId=next.id;log(room,`${p.name} の切断が10秒続いたため、${next.name} にホストを移譲しました。`);publish(room);}},10000);}});return;
    }
    if(req.method==='POST'&&url.pathname==='/api/action'){
      const b=await readJson(req),room=rooms.get(String(b.code||'').toUpperCase());if(!room)throw new Error('部屋が見つかりません。');const participant=getParticipant(room,String(b.token||''));if(!participant)throw new Error('参加情報が無効です。');const type=String(b.type||''),x=b.payload||{};
      if(type==='setParticipationType'){
        if(!canSwitchParticipation(room,participant))throw new Error('参加方法はロビーでのみ変更できます。');const target=String(x.participationType||'');if(!['player','spectator'].includes(target))throw new Error('参加方法が不正です。');const spectator=isSpectator(room,participant);if(target==='spectator'&&!spectator){if(room.hostId===participant.id)throw new Error('ホストは観戦者に切り替えできません。');room.players=room.players.filter(q=>q.id!==participant.id);room.returnedPlayers.delete(participant.id);participant.role=null;room.spectators.push(participant);log(room,`${participant.name} が観戦者に切り替えました。`);}else if(target==='player'&&spectator){if(room.players.length>=10)throw new Error('プレイヤーは10人までです。');room.spectators=room.spectators.filter(q=>q.id!==participant.id);participant.role=null;room.players.push(participant);if(room.phase==='rematch')room.returnedPlayers.add(participant.id);log(room,`${participant.name} がプレイヤーに切り替えました。`);}publish(room);return json(res,200,{ok:true});
      }
      if(type==='removeSpectator'){
        const player=getPlayer(room,participant.token);ensureHost(room,player);const t=room.spectators.find(q=>q.id===x.spectatorId);if(t){removeParticipant(room,t);room.spectators=room.spectators.filter(q=>q.id!==t.id);log(room,`${t.name} を観戦者から削除しました。`);}publish(room);return json(res,200,{ok:true});
      }
      if(type==='leaveRoom'&&isSpectator(room,participant)){
        const name=participant.name;removeParticipant(room,participant);room.spectators=room.spectators.filter(q=>q.id!==participant.id);log(room,`${name} が退出しました。`);publish(room);return json(res,200,{ok:true});
      }
      const p=getPlayer(room,participant.token);if(!p)throw new Error('プレイヤーのみ実行できます。');
      if(type==='updateSetup'){ensureHost(room,p);if(!isLobbyPlayer(room,p))throw new Error('ロビーでのみ変更できます。');const s=x.setup||{},preset=['standard','simple','custom'].includes(s.preset)?s.preset:'standard';room.setup={preset,custom:{merlin:!!s.custom?.merlin,percival:!!s.custom?.percival,assassin:!!s.custom?.assassin,morgana:!!s.custom?.morgana,mordred:!!s.custom?.mordred,oberon:!!s.custom?.oberon}};}
      else if(type==='updateTimerSettings'){ensureHost(room,p);if(!isLobbyPlayer(room,p))throw new Error('ロビーでのみ変更できます。');const s=x.timerSettings||{};room.timerSettings={enabled:!!s.enabled,team:validateTimerSeconds(s.team),vote:validateTimerSeconds(s.vote),result:validateTimerSeconds(s.result),quest:validateTimerSeconds(s.quest),assassination:validateTimerSeconds(s.assassination)};}
      else if(type==='pauseTimer'){ensureHost(room,p);ensureTimerControllable(room);if(room.timer.endsAt==null)throw new Error('タイマーはすでに一時停止しています。');const r=Math.max(0,Math.ceil((room.timer.endsAt-Date.now())/1000));room.timer={phase:room.phase,endsAt:null,pausedRemainingSeconds:r};}
      else if(type==='resumeTimer'){ensureHost(room,p);ensureTimerControllable(room);if(room.timer.pausedRemainingSeconds==null)throw new Error('タイマーは一時停止していません。');const r=room.timer.pausedRemainingSeconds;room.timer={phase:room.phase,endsAt:Date.now()+r*1000,pausedRemainingSeconds:null};}
      else if(type==='resetTimer'){ensureHost(room,p);ensureTimerControllable(room);startPhaseTimer(room,room.phase);}
      else if(type==='setTimer'){ensureHost(room,p);ensureTimerControllable(room);const sec=validateTimerSeconds(x.seconds),paused=room.timer.endsAt==null&&room.timer.pausedRemainingSeconds!=null;room.timer=paused?{phase:room.phase,endsAt:null,pausedRemainingSeconds:sec}:{phase:room.phase,endsAt:Date.now()+sec*1000,pausedRemainingSeconds:null};}
      else if(type==='removePlayer'){ensureHost(room,p);if(!isLobbyPlayer(room,p))throw new Error('ロビーでのみ削除できます。');if(x.playerId===room.hostId)throw new Error('ホスト自身は削除できません。');const t=room.players.find(q=>q.id===x.playerId);if(t){removeParticipant(room,t);room.players=room.players.filter(q=>q.id!==t.id);room.returnedPlayers.delete(t.id);log(room,`${t.name} を部屋から削除しました。`);}}
      else if(type==='startGame'){ensureHost(room,p);if(!isLobbyPlayer(room,p))throw new Error('ロビーから開始してください。');if(room.phase==='rematch')excludeNonReturnedPlayers(room);const n=room.players.length;if(!QUEST_CONFIG[n])throw new Error('ロビーに戻った参加者が5〜10人そろうと開始できます。');if(room.players.some(q=>!q.connected))throw new Error('切断中のプレイヤーがいます。削除するか再接続を待ってください。');let roles=room.setup.preset==='simple'?simpleRoles(n):room.setup.preset==='custom'?customRoles(n,room.setup.custom):defaultRoles(n);roles=shuffle(roles);room.players.forEach((q,i)=>q.role=roles[i]);room.players=shuffle(room.players);room.leaderId=room.players[crypto.randomInt(room.players.length)].id;room.returnedPlayers=new Set();room.selectedTeam=[];room.questIndex=0;room.quests=[null,null,null,null,null];room.proposalNumber=1;room.rejectionCount=0;room.votes=new Map();room.voteResults=null;room.questVotes=new Map();clearResultState(room);room.winner=null;room.winnerReason=null;room.assassinationTargetId=null;room.log=[];setPhase(room,'team');log(room,'ゲームを開始しました。');log(room,`${room.players.find(q=>q.id===room.leaderId).name} が最初のリーダーです。`);}
      else if(type==='proposeTeam'){if(room.phase!=='team')throw new Error('現在はチーム編成フェーズではありません。');if(p.id!==room.leaderId)throw new Error('現在のリーダーのみ編成できます。');const reqd=QUEST_CONFIG[room.players.length].team[room.questIndex],u=[...new Set(Array.isArray(x.playerIds)?x.playerIds:[])];if(u.length!==reqd)throw new Error(`クエストメンバーを ${reqd} 人選んでください。`);if(u.some(id=>!room.players.some(q=>q.id===id)))throw new Error('無効なプレイヤーが含まれています。');room.selectedTeam=u;room.votes=new Map();room.voteResults=null;setPhase(room,'vote');log(room,`${p.name} がクエストチームを提案しました。`);}
      else if(type==='voteTeam'){if(room.phase!=='vote')throw new Error('現在は投票フェーズではありません。');if(room.votes.has(p.id))throw new Error('すでに投票済みです。');room.votes.set(p.id,!!x.approve);if(room.votes.size===room.players.length){const a=[...room.votes.values()].filter(Boolean).length,r=room.players.length-a;room.voteResults=room.players.map(q=>({id:q.id,approve:room.votes.get(q.id)}));if(a>r){log(room,`チームが承認されました（承認 ${a} / 否認 ${r}）。`);beginResultPhase(room,'vote_result','quest');}else{room.rejectionCount++;log(room,`チームは否認されました（承認 ${a} / 否認 ${r}）。`);beginResultPhase(room,'vote_result',room.rejectionCount>=5?'gameover_rejections':'team_after_reject');}}}
      else if(type==='questVote'){if(room.phase!=='quest')throw new Error('現在はクエストフェーズではありません。');if(!room.selectedTeam.includes(p.id))throw new Error('クエスト参加者のみ選択できます。');if(room.questVotes.has(p.id))throw new Error('すでにクエスト結果を送信済みです。');if(ROLE_META[p.role]?.team==='good'&&!x.success)throw new Error('善陣営はクエスト成功のみ選択できます。');room.questVotes.set(p.id,!!x.success);if(room.questVotes.size===room.selectedTeam.length){const f=[...room.questVotes.values()].filter(v=>!v).length,rf=room.questIndex===3&&room.players.length>=7?2:1,success=f<rf;room.quests[room.questIndex]={index:room.questIndex,team:[...room.selectedTeam],success,failCount:f,requiredFails:rf};log(room,`第${room.questIndex+1}クエストは${success?'成功':'失敗'}（失敗票 ${f}）。`);const gs=room.quests.filter(q=>q?.success).length,es=room.quests.filter(q=>q&&!q.success).length;if(es>=3)beginResultPhase(room,'quest_result','gameover_evil_quests');else if(gs>=3){const m=room.players.find(q=>q.role==='merlin'),a=room.players.find(q=>q.role==='assassin');beginResultPhase(room,'quest_result',m&&a?'assassination':'gameover_good_quests');}else beginResultPhase(room,'quest_result','team_after_quest');}}
      else if(type==='confirmResult'){if(!isResultPhase(room))throw new Error('現在は結果確認フェーズではありません。');room.confirmations.add(p.id);if(room.confirmations.size===room.players.length)advanceResultPhase(room);}
      else if(type==='advanceResult'){ensureHost(room,p);if(!isResultPhase(room))throw new Error('現在は結果確認フェーズではありません。');advanceResultPhase(room);}
      else if(type==='assassinate'){if(room.phase!=='assassination')throw new Error('現在は暗殺フェーズではありません。');if(p.role!=='assassin')throw new Error('暗殺者のみ実行できます。');const t=room.players.find(q=>q.id===x.playerId);if(!t)throw new Error('対象が見つかりません。');room.assassinationTargetId=t.id;if(t.role==='merlin')finish(room,'evil',`${t.name}（マーリン）の暗殺に成功した`);else finish(room,'good',`${t.name} を暗殺したがマーリンではなかった`);}
      else if(type==='endGame')endGameByHost(room,p);
      else if(type==='restartGame'){ensureHost(room,p);if(room.phase!=='gameover')throw new Error('ゲーム終了後に実行できます。');setPhase(room,'rematch');room.returnedPlayers=new Set([p.id]);log(room,'ホストが再戦ロビーを開きました。');}
      else if(type==='returnToLobby'){if(room.phase!=='rematch')throw new Error('ホストが再戦ロビーを開くまで戻れません。');room.returnedPlayers.add(p.id);log(room,`${p.name} がロビーに戻りました。`);if(room.returnedPlayers.size===room.players.length){resetGameFields(room);room.log=[];log(room,'全員がロビーに戻りました。');}}
      else if(type==='leaveRoom'){if(!isLobbyPlayer(room,p))throw new Error('ゲーム中は退出できません。ブラウザを閉じた場合は同じ端末から再接続できます。');const name=p.name;removeParticipant(room,p);room.players=room.players.filter(q=>q.id!==p.id);room.returnedPlayers.delete(p.id);if(room.hostId===p.id&&room.players.length){const h=room.players.find(q=>room.phase!=='rematch'||room.returnedPlayers.has(q.id))||room.players[0];room.hostId=h.id;}if(!closeRoomIfNoPlayers(room))log(room,`${name} が退出しました。`);else return json(res,200,{ok:true});}
      else throw new Error('不明な操作です。');
      publish(room);return json(res,200,{ok:true});
    }
    json(res,404,{ok:false,message:'Not found'});
  }catch(e){json(res,400,{ok:false,message:e.message||'操作に失敗しました。'});}
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
function serveStatic(req,res,url){let rel=decodeURIComponent(url.pathname);if(rel==='/')rel='/index.html';const file=path.normalize(path.join(PUBLIC_DIR,rel));if(!file.startsWith(PUBLIC_DIR)){res.writeHead(403);return res.end('Forbidden');}fs.stat(file,(err,st)=>{if(err||!st.isFile()){const index=path.join(PUBLIC_DIR,'index.html');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return fs.createReadStream(index).pipe(res);}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});}
const server=http.createServer((req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname==='/health')return json(res,200,{ok:true,rooms:rooms.size});if(url.pathname.startsWith('/api/'))return handleApi(req,res,url);serveStatic(req,res,url);});
setInterval(()=>{const cutoff=Date.now()-6*60*60*1000;for(const[code,room]of rooms)if(room.updatedAt<cutoff){for(const p of [...room.players,...room.spectators])try{p.stream?.end();}catch{}rooms.delete(code);}},60*60*1000).unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`Avalon Online running on http://0.0.0.0:${PORT}`));
module.exports={server,rooms,QUEST_CONFIG,TIMER_DEFAULTS,ROLE_META,defaultRoles,simpleRoles,customRoles,publicState,roleKnowledge,spectatorSecrets};
