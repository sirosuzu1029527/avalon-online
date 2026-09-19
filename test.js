const assert = require('assert');
const { server, rooms, QUEST_CONFIG, TIMER_DEFAULTS, ROLE_META, publicState } = require('./server');

async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const rawPost=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const post=async(path,body)=>{const x=await rawPost(path,body);if(x.status>=400)throw new Error(x.body.message);return x.body;};

  const c=await post('/api/create',{name:'Host',token:'h'});
  for(let i=2;i<=10;i++) await post('/api/join',{code:c.code,name:`P${i}`,token:`p${i}`});
  const room=rooms.get(c.code);
  assert.equal(room.players.length,10);assert.equal(room.spectators.length,0);

  await post('/api/join',{code:c.code,name:'Watcher',token:'s1'});
  assert.equal(room.players.length,10);assert.equal(room.spectators.length,1);
  const spectator=room.spectators[0];
  let ss=publicState(room,spectator);
  assert.equal(ss.me.isSpectator,true);assert.ok(ss.spectatorSecrets);assert.equal(ss.spectatorSecrets.players.length,10);
  const ps=publicState(room,room.players[1]);
  assert.equal('spectatorSecrets' in ps,false);

  const hostSwitch=await rawPost('/api/action',{code:c.code,token:'h',type:'setParticipationType',payload:{participationType:'spectator'}});
  assert.equal(hostSwitch.status,400);assert.match(hostSwitch.body.message,/ホスト/);
  const fullSwitch=await rawPost('/api/action',{code:c.code,token:'s1',type:'setParticipationType',payload:{participationType:'player'}});
  assert.equal(fullSwitch.status,400);assert.match(fullSwitch.body.message,/10人/);

  await post('/api/action',{code:c.code,token:'p10',type:'setParticipationType',payload:{participationType:'spectator'}});
  assert.equal(room.players.length,9);assert.equal(room.spectators.length,2);
  await post('/api/action',{code:c.code,token:'s1',type:'setParticipationType',payload:{participationType:'player'}});
  assert.equal(room.players.length,10);assert.equal(room.spectators.length,1);

  const watcher=room.spectators[0];
  await post('/api/action',{code:c.code,token:'h',type:'removeSpectator',payload:{spectatorId:watcher.id}});
  assert.equal(room.spectators.length,0);

  // Make a 5-player room and verify spectator mid-game behavior and secret boundary.
  const c2=await post('/api/create',{name:'H2',token:'x1'});
  for(let i=2;i<=5;i++)await post('/api/join',{code:c2.code,name:`X${i}`,token:`x${i}`});
  const r2=rooms.get(c2.code);r2.players.forEach(p=>p.connected=true);
  await post('/api/action',{code:c2.code,token:'x1',type:'startGame',payload:{}});
  assert.equal(r2.phase,'team');assert.equal(r2.players.length,5);
  await post('/api/join',{code:c2.code,name:'Late',token:'late'});
  assert.equal(r2.players.length,5);assert.equal(r2.spectators.length,1);
  const late=r2.spectators[0], lateState=publicState(r2,late);
  assert.equal(lateState.me.isSpectator,true);assert.ok(lateState.spectatorSecrets.players.every(p=>p.role));
  assert.equal(publicState(r2,r2.players[0]).spectatorSecrets,undefined);
  const illegal=await rawPost('/api/action',{code:c2.code,token:'late',type:'voteTeam',payload:{approve:true}});
  assert.equal(illegal.status,400);assert.match(illegal.body.message,/プレイヤーのみ/);

  const leader=r2.players.find(p=>p.id===r2.leaderId);
  const team=r2.players.slice(0,QUEST_CONFIG[5].team[0]).map(p=>p.id);
  await post('/api/action',{code:c2.code,token:leader.token,type:'proposeTeam',payload:{playerIds:team}});
  await post('/api/action',{code:c2.code,token:r2.players[0].token,type:'voteTeam',payload:{approve:true}});
  const secretDuringVote=publicState(r2,late).spectatorSecrets.liveVotes;
  assert.equal(secretDuringVote.find(v=>v.id===r2.players[0].id).approve,true);
  assert.equal(secretDuringVote.filter(v=>v.submitted).length,1);

  // Spectators can leave during games.
  await post('/api/action',{code:c2.code,token:'late',type:'leaveRoom',payload:{}});
  assert.equal(r2.spectators.length,0);

  // A proposal is only public after every player has voted.
  assert.deepEqual(publicState(r2,r2.players[0]).voteHistory,[]);
  const originalLeader = r2.players.find(p=>p.id===r2.leaderId);
  assert.equal(originalLeader.id,leader.id);
  for(const [i,p] of r2.players.slice(1).entries()){
    await post('/api/action',{code:c2.code,token:p.token,type:'voteTeam',payload:{approve:i===0}});
    if(i<3)assert.equal(publicState(r2,r2.players[0]).voteHistory.length,0);
  }
  assert.equal(r2.phase,'vote_result');
  let history=publicState(r2,r2.players[0]).voteHistory;
  assert.equal(history.length,1);
  assert.deepEqual(history[0].votes.map(v=>v.approve),r2.players.map(p=>p===r2.players[0]||p===r2.players[1]));
  assert.equal(history[0].approvals,2);
  assert.equal(history[0].rejects,3);
  assert.equal(history[0].approved,false);
  assert.equal(history[0].questIndex,0);
  assert.equal(history[0].proposalInQuest,1);
  assert.deepEqual(history[0].team.map(p=>p.id),team);
  assert.deepEqual(history[0].leader,{id:originalLeader.id,name:originalLeader.name});
  assert.equal(history[0].votes.every(v=>typeof v.name==='string'),true);
  assert.equal('questVotes' in history[0],false);

  // A rejected proposal stays available after moving to the next leader.
  await post('/api/action',{code:c2.code,token:'x1',type:'advanceResult',payload:{}});
  assert.equal(r2.phase,'team');
  assert.equal(publicState(r2,r2.players[0]).voteHistory.length,1);
  const leader2=r2.players.find(p=>p.id===r2.leaderId);
  await post('/api/action',{code:c2.code,token:leader2.token,type:'proposeTeam',payload:{playerIds:team}});
  for(const p of r2.players)await post('/api/action',{code:c2.code,token:p.token,type:'voteTeam',payload:{approve:true}});
  history=publicState(r2,r2.players[0]).voteHistory;
  assert.equal(history.length,2);
  assert.equal(history[1].proposalInQuest,2);
  assert.equal(history[1].approved,true);
  assert.equal(history[1].approvals,5);
  assert.equal(history[1].rejects,0);

  // Results survive the end screen and rematch lobby, then clear on new game.
  await post('/api/action',{code:c2.code,token:'x1',type:'endGame',payload:{}});
  assert.equal(r2.phase,'gameover');
  assert.equal(publicState(r2,r2.players[0]).voteHistory.length,2);
  await post('/api/action',{code:c2.code,token:'x1',type:'restartGame',payload:{}});
  for(const p of r2.players)await post('/api/action',{code:c2.code,token:p.token,type:'returnToLobby',payload:{}});
  assert.equal(r2.phase,'lobby');
  assert.equal(r2.voteHistory.length,2);
  await post('/api/action',{code:c2.code,token:'x1',type:'startGame',payload:{}});
  assert.equal(r2.phase,'team');
  assert.deepEqual(publicState(r2,r2.players[0]).voteHistory,[]);

  assert.deepEqual(TIMER_DEFAULTS,{enabled:true,team:120,vote:30,result:20,quest:30,assassination:120});
  assert.equal(r2.players.filter(p=>ROLE_META[p.role].team==='evil').length,QUEST_CONFIG[5].evil);
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/vote-history\.js/);
  console.log('All tests passed');
  await new Promise(resolve=>server.close(resolve));
}
main().catch(async e=>{console.error(e);try{await new Promise(r=>server.close(r));}catch{}process.exit(1);});
