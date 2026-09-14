const assert = require('assert');
const { server, rooms, defaultRoles, simpleRoles, customRoles, QUEST_CONFIG, TIMER_DEFAULTS, ROLE_META, publicState } = require('./server');

function approxTimerSeconds(timer, expected, tolerance = 1) {
  assert.equal(timer.phase != null, true);
  assert.equal(timer.pausedRemainingSeconds, null);
  const remaining = Math.ceil((timer.endsAt - Date.now()) / 1000);
  assert.ok(remaining >= expected - tolerance && remaining <= expected, `expected about ${expected}s, got ${remaining}s`);
}

async function main() {
  for(let n=5;n<=10;n++) {
    const roles=defaultRoles(n);
    assert.equal(roles.length,n);
    assert.equal(roles.filter(r=>ROLE_META[r].team==='evil').length,QUEST_CONFIG[n].evil);
    assert.equal(roles.filter(r=>ROLE_META[r].team==='good').length,n-QUEST_CONFIG[n].evil);
  }
  assert.equal(simpleRoles(5).length,5);
  assert.throws(()=>customRoles(5,{merlin:true,assassin:false}),/暗殺者/);
  assert.deepEqual(TIMER_DEFAULTS,{enabled:true,team:120,vote:30,result:20,quest:30,assassination:120});

  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port, base=`http://127.0.0.1:${port}`;
  const post=async(path,body)=>{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok) throw new Error(j.message);
    return j;
  };
  const rawPost=async(path,body)=>{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };

  const home=await fetch(base+'/'); assert.equal(home.status,200); const homeText=await home.text(); assert.match(homeText,/AVALON/); assert.match(homeText,/timer\.js/);
  const c=await post('/api/create',{name:'P1',token:'t1'}); assert.equal(c.code.length,5);
  for(let i=2;i<=6;i++) await post('/api/join',{code:c.code,name:`P${i}`,token:`t${i}`});
  const room=rooms.get(c.code); assert.equal(room.players.length,6);
  assert.deepEqual(room.timerSettings,{...TIMER_DEFAULTS});
  assert.equal(room.timer.phase,null);
  room.players.forEach(p=>p.connected=true);

  const initialNonHost=room.players.find(p=>p.id!==room.hostId);
  const deniedTimerSettings=await rawPost('/api/action',{code:c.code,token:initialNonHost.token,type:'updateTimerSettings',payload:{timerSettings:{enabled:true,team:10,vote:11,result:12,quest:13,assassination:14}}});
  assert.equal(deniedTimerSettings.status,400);assert.match(deniedTimerSettings.body.message,/ホストのみ/);
  await post('/api/action',{code:c.code,token:'t1',type:'updateTimerSettings',payload:{timerSettings:{enabled:true,team:10,vote:11,result:12,quest:13,assassination:14}}});
  assert.deepEqual(room.timerSettings,{enabled:true,team:10,vote:11,result:12,quest:13,assassination:14});
  const badTimerSettings=await rawPost('/api/action',{code:c.code,token:'t1',type:'updateTimerSettings',payload:{timerSettings:{enabled:true,team:0,vote:11,result:12,quest:13,assassination:14}}});
  assert.equal(badTimerSettings.status,400);assert.match(badTimerSettings.body.message,/1〜3600秒/);

  await post('/api/action',{code:c.code,token:'t1',type:'startGame',payload:{}});
  assert.equal(room.phase,'team');
  assert.equal(room.players.filter(p=>ROLE_META[p.role].team==='evil').length,2);
  assert.equal(room.timer.phase,'team');approxTimerSeconds(room.timer,10);
  const timerState=publicState(room,room.players.find(p=>p.id===room.hostId));
  assert.equal(timerState.timerSettings.team,10);assert.equal(timerState.timer.phase,'team');assert.ok(Number.isFinite(timerState.serverNow));

  const nonHost=room.players.find(p=>p.id!==room.hostId);
  const deniedTimer=await rawPost('/api/action',{code:c.code,token:nonHost.token,type:'pauseTimer',payload:{}});
  assert.equal(deniedTimer.status,400);assert.match(deniedTimer.body.message,/ホストのみ/);
  await post('/api/action',{code:c.code,token:'t1',type:'pauseTimer',payload:{}});
  assert.equal(room.timer.endsAt,null);assert.ok(room.timer.pausedRemainingSeconds>=9&&room.timer.pausedRemainingSeconds<=10);
  await post('/api/action',{code:c.code,token:'t1',type:'setTimer',payload:{seconds:7}});
  assert.equal(room.timer.endsAt,null);assert.equal(room.timer.pausedRemainingSeconds,7);
  await post('/api/action',{code:c.code,token:'t1',type:'resumeTimer',payload:{}});
  assert.equal(room.timer.pausedRemainingSeconds,null);approxTimerSeconds(room.timer,7);
  await post('/api/action',{code:c.code,token:'t1',type:'setTimer',payload:{seconds:9}});approxTimerSeconds(room.timer,9);
  await post('/api/action',{code:c.code,token:'t1',type:'resetTimer',payload:{}});approxTimerSeconds(room.timer,10);

  await post('/api/action',{code:c.code,token:'t1',type:'endGame',payload:{}});
  assert.equal(room.phase,'gameover');
  assert.equal(room.timer.phase,null);
  assert.equal(room.winner,null);
  const host=room.players.find(p=>p.id===room.hostId);
  assert.ok(publicState(room,host).players.every(p=>p.role));

  const beforeRestartNonHost=room.players.find(p=>p.id!==room.hostId);
  assert.equal(publicState(room,beforeRestartNonHost).phase,'gameover');

  await post('/api/action',{code:c.code,token:'t1',type:'restartGame',payload:{}});
  assert.equal(room.phase,'rematch');
  assert.equal(room.timer.phase,null);
  assert.equal(publicState(room,host).phase,'lobby');
  assert.equal(publicState(room,beforeRestartNonHost).phase,'gameover');
  assert.equal(publicState(room,beforeRestartNonHost).rematchOpen,true);

  const others=room.players.filter(p=>p.id!==room.hostId);
  for(const p of others.slice(0,4)) await post('/api/action',{code:c.code,token:p.token,type:'returnToLobby',payload:{}});
  assert.equal(room.returnedPlayers.size,5);
  assert.equal(publicState(room,others[0]).phase,'lobby');
  assert.equal(publicState(room,others[4]).phase,'gameover');

  room.players.forEach(p=>p.connected=true);
  const excluded=others[4];
  await post('/api/action',{code:c.code,token:'t1',type:'startGame',payload:{}});
  assert.equal(room.phase,'team');
  assert.equal(room.players.length,5);
  assert.ok(!room.players.some(p=>p.id===excluded.id));
  assert.equal(room.players.filter(p=>ROLE_META[p.role].team==='evil').length,QUEST_CONFIG[5].evil);
  assert.equal(room.timer.phase,'team');approxTimerSeconds(room.timer,10);

  const leader=room.players.find(p=>p.id===room.leaderId);
  const team=room.players.slice(0,QUEST_CONFIG[5].team[0]).map(p=>p.id);
  await post('/api/action',{code:c.code,token:leader.token,type:'proposeTeam',payload:{playerIds:team}});
  assert.equal(room.phase,'vote');assert.equal(room.timer.phase,'vote');approxTimerSeconds(room.timer,11);
  for(const p of room.players) await post('/api/action',{code:c.code,token:p.token,type:'voteTeam',payload:{approve:true}});
  assert.equal(room.phase,'vote_result');assert.equal(room.timer.phase,'vote_result');approxTimerSeconds(room.timer,12);
  const voteState=publicState(room,host);
  assert.equal(voteState.voteOutcome.approved,true);
  assert.equal(voteState.resultConfirmationCount,0);
  for(const p of room.players.slice(0,-1)) await post('/api/action',{code:c.code,token:p.token,type:'confirmResult',payload:{}});
  assert.equal(room.phase,'vote_result');
  await post('/api/action',{code:c.code,token:room.players.at(-1).token,type:'confirmResult',payload:{}});
  assert.equal(room.phase,'quest');assert.equal(room.timer.phase,'quest');approxTimerSeconds(room.timer,13);

  for(const id of team){
    const p=room.players.find(q=>q.id===id);
    await post('/api/action',{code:c.code,token:p.token,type:'questVote',payload:{success:true}});
  }
  assert.equal(room.phase,'quest_result');assert.equal(room.timer.phase,'quest_result');approxTimerSeconds(room.timer,12);
  assert.equal(publicState(room,host).questOutcome.success,true);
  for(const p of room.players) await post('/api/action',{code:c.code,token:p.token,type:'confirmResult',payload:{}});
  assert.equal(room.phase,'team');
  assert.equal(room.questIndex,1);
  assert.equal(room.timer.phase,'team');approxTimerSeconds(room.timer,10);

  const health=await fetch(base+'/health'); assert.equal((await health.json()).ok,true);
  console.log('All tests passed');
  await new Promise(resolve=>server.close(resolve));
}
main().catch(async e=>{console.error(e);try{await new Promise(r=>server.close(r));}catch{}process.exit(1)});
