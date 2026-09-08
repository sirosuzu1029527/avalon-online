const assert = require('assert');
const { server, rooms, defaultRoles, simpleRoles, customRoles, MISSION_CONFIG, ROLE_META } = require('./server');

async function main() {
  for (let n=5;n<=10;n++) {
    const roles=defaultRoles(n);
    assert.equal(roles.length,n);
    assert.equal(roles.filter(r=>ROLE_META[r].team==='evil').length,MISSION_CONFIG[n].evil);
    assert.equal(roles.filter(r=>ROLE_META[r].team==='good').length,n-MISSION_CONFIG[n].evil);
  }
  assert.equal(simpleRoles(5).length,5);
  assert.throws(()=>customRoles(5,{merlin:true,assassin:false}),/暗殺者/);

  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port, base=`http://127.0.0.1:${port}`;
  const post=async(path,body)=>{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok) throw new Error(j.message);
    return j;
  };
  const home=await fetch(base+'/'); assert.equal(home.status,200); assert.match(await home.text(),/AVALON/);
  const c=await post('/api/create',{name:'P1',token:'t1'}); assert.equal(c.code.length,5);
  for(let i=2;i<=5;i++) await post('/api/join',{code:c.code,name:`P${i}`,token:`t${i}`});
  const room=rooms.get(c.code); assert.equal(room.players.length,5);
  room.players.forEach(p=>p.connected=true);
  await post('/api/action',{code:c.code,token:'t1',type:'startGame',payload:{}});
  assert.equal(room.phase,'team');
  assert.equal(room.players.filter(p=>ROLE_META[p.role].team==='evil').length,2);
  assert.ok(room.leaderId);
  const leader=room.players.find(p=>p.id===room.leaderId);
  const required=MISSION_CONFIG[5].team[0];
  await post('/api/action',{code:c.code,token:leader.token,type:'proposeTeam',payload:{playerIds:room.players.slice(0,required).map(p=>p.id)}});
  assert.equal(room.phase,'vote');
  for(const p of room.players) await post('/api/action',{code:c.code,token:p.token,type:'voteTeam',payload:{approve:true}});
  assert.equal(room.phase,'mission');
  for(const id of room.selectedTeam){ const p=room.players.find(q=>q.id===id); await post('/api/action',{code:c.code,token:p.token,type:'missionVote',payload:{success:true}}); }
  assert.equal(room.missions[0].success,true);
  assert.equal(room.phase,'team');
  const health=await fetch(base+'/health'); assert.equal((await health.json()).ok,true);
  console.log('All tests passed');
  await new Promise(resolve=>server.close(resolve));
}
main().catch(async e=>{console.error(e);try{await new Promise(r=>server.close(r));}catch{}process.exit(1)});
