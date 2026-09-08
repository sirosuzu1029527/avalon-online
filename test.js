const assert = require('assert');
const { server, rooms, defaultRoles, simpleRoles, customRoles, MISSION_CONFIG, ROLE_META, publicState } = require('./server');

async function main() {
  for(let n=5;n<=10;n++) {
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
  const rawPost=async(path,body)=>{
    const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };

  const home=await fetch(base+'/'); assert.equal(home.status,200); assert.match(await home.text(),/AVALON/);
  const c=await post('/api/create',{name:'P1',token:'t1'}); assert.equal(c.code.length,5);
  for(let i=2;i<=6;i++) await post('/api/join',{code:c.code,name:`P${i}`,token:`t${i}`});
  const room=rooms.get(c.code); assert.equal(room.players.length,6);
  room.players.forEach(p=>p.connected=true);

  await post('/api/action',{code:c.code,token:'t1',type:'startGame',payload:{}});
  assert.equal(room.phase,'team');
  assert.equal(room.players.filter(p=>ROLE_META[p.role].team==='evil').length,2);

  const nonHost=room.players.find(p=>p.id!==room.hostId);
  const denied=await rawPost('/api/action',{code:c.code,token:nonHost.token,type:'endGame',payload:{}});
  assert.equal(denied.status,400);
  assert.match(denied.body.message,/ホストのみ/);

  await post('/api/action',{code:c.code,token:'t1',type:'endGame',payload:{}});
  assert.equal(room.phase,'gameover');
  assert.equal(room.winner,null);
  const host=room.players.find(p=>p.id===room.hostId);
  assert.ok(publicState(room,host).players.every(p=>p.role));

  const beforeRestartNonHost=room.players.find(p=>p.id!==room.hostId);
  assert.equal(publicState(room,beforeRestartNonHost).phase,'gameover');

  await post('/api/action',{code:c.code,token:'t1',type:'restartGame',payload:{}});
  assert.equal(room.phase,'rematch');
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
  assert.equal(room.players.filter(p=>ROLE_META[p.role].team==='evil').length,MISSION_CONFIG[5].evil);

  const health=await fetch(base+'/health'); assert.equal((await health.json()).ok,true);
  console.log('All tests passed');
  await new Promise(resolve=>server.close(resolve));
}
main().catch(async e=>{console.error(e);try{await new Promise(r=>server.close(r));}catch{}process.exit(1)});
