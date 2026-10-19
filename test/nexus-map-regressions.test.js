'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function mapLibrary(){
  const a=html.indexOf('const MAP_LIBRARY=');
  const b=html.indexOf('\n};\nfunction loadMapSelection',a)+3;
  assert.ok(a>=0&&b>a,'MAP_LIBRARY deve existir');
  const ctx={};vm.createContext(ctx);
  vm.runInContext(html.slice(a,b)+'\n;globalThis.__maps=MAP_LIBRARY;',ctx);
  return ctx.__maps;
}
function nexusWalk(){
  const m=mapLibrary().nexus,C=64,R=46;
  const floor=new Uint8Array(C*R),block=new Uint8Array(C*R);
  const fill=(arr,r,v=1)=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(x>=0&&y>=0&&x<C&&y<R)arr[y*C+x]=v};
  m.corridors.forEach(r=>fill(floor,r));m.rooms.forEach(r=>fill(floor,r));
  m.decor.forEach(d=>{if(!['decon','balcony_hq'].includes(d.k))fill(block,d)});
  m.stations.forEach(st=>{if(st.kind!=='decon')fill(block,st)});
  const walk=new Uint8Array(C*R);for(let i=0;i<walk.length;i++)walk[i]=floor[i]&&!block[i]?1:0;
  return {m,C,R,floor,walk};
}

test('Nexus HQ mantém a área inicial ampla e a malha caminhável sem bolsões isolados',()=>{
  const {m,C,R,walk}=nexusWalk();
  const ship=m.rooms.find(r=>r.id==='ship'),hall=m.rooms.find(r=>r.id==='shiphall');
  assert.ok(ship.w*ship.h>=190,'Nave deve ter sido ampliada');
  assert.ok(hall.w*hall.h>=49,'Corredor da Nave deve ter espaço para circulação');
  assert.equal(walk[m.spawn.y*C+m.spawn.x],1,'spawn de contingência precisa ser caminhável');
  const start=[];for(let y=0;y<R&&!start.length;y++)for(let x=0;x<C;x++)if(walk[y*C+x]){start.push([x,y]);break}
  const q=start.slice(),seen=new Set([start[0][1]*C+start[0][0]]);
  for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=ny*C+nx;if(nx<0||ny<0||nx>=C||ny>=R||seen.has(k)||!walk[k])continue;seen.add(k);q.push([nx,ny])}}
  const total=walk.reduce((n,v)=>n+v,0);
  assert.equal(seen.size,total,'não deve haver áreas caminháveis isoladas que prendam jogadores ou NPCs');
});

test('Nexus usa Nave no início, Cafeteria após reuniões e spawn válido na Partida Livre',()=>{
  assert.match(html,/function startSpawnPoints\(n\)\{return roomSpawnPoints\(ACTIVE_MAP_ID==='nexus'\?'ship':'cafe',n\)\}/);
  assert.match(html,/function meetingSpawnPoints\(n\)\{return roomSpawnPoints\('cafe',n\)\}/);
  assert.match(html,/const freeSpawn=startSpawnPoints\(1\)\[0\];placeChar\(p,freeSpawn\|\|\{x:SPAWN\.x,y:SPAWN\.y\}\)/);
});

test('cenário da Nexus permanece visível, mas personagens continuam limitados por linha de visão',()=>{
  assert.match(html,/if\(ACTIVE_MAP_ID==='nexus'\)return 1;/);
  assert.match(html,/fogC\.fillStyle='rgba\(2,3,14,\.94\)'/,'a Nexus deve reutilizar a mesma névoa base da Nave');
  assert.match(html,/if\(d>rng\|\|!losClear\(o\.viewer\.x,o\.viewer\.y,ch\.x,ch\.y\)\)return 0;/);
  assert.match(html,/const exteriorReveal=lightsDown\?\.55:\.72/,'o céu externo da Nexus deve permanecer visível com escurecimento translúcido');
  assert.match(html,/OUTSIDE_VOID\[ty\*COLS\+tx\]/,'a adaptação externa deve continuar limitada ao vazio conectado ao céu');

  assert.match(html,/\{id:'decon_w',x:24,y:22,w:1,h:2,decon:true\},\{id:'decon_e',x:29,y:22,w:1,h:2,decon:true\}/);
  assert.doesNotMatch(html,/\{x:24,y:26,w:6,h:[2-9]\}/,'Descontaminação não deve ter uma terceira abertura vertical');
  assert.match(html,/const dc=ROOM_BY_ID\.decon;[\s\S]*if\(edge&&!doorTile\[i\]\)\{floor\[i\]=0;roomAt\[i\]=-1\}/);
});

test('carregamento inicial não acessa o cache APP antes da inicialização',()=>{
  const decl=html.indexOf('const APP={}');
  const firstActivation=html.indexOf('activateMapData(SELECTED_MAP_ID,false)');
  assert.ok(decl>=0&&firstActivation>=0&&decl<firstActivation,'APP precisa existir antes da ativação inicial do mapa');
  assert.equal(html.indexOf('const APP={}',decl+1),-1,'APP não deve ser redeclarado depois do carregamento');
});


test('Nexus mantém geometria organizada, hitboxes coerentes e tarefas nas bordas das salas',()=>{
  const m=mapLibrary().nexus;
  const rectOverlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(let i=0;i<m.rooms.length;i++)for(let j=i+1;j<m.rooms.length;j++){
    assert.equal(rectOverlap(m.rooms[i],m.rooms[j]),false,`salas ${m.rooms[i].id} e ${m.rooms[j].id} não devem se sobrepor`);
  }
  const roomBy=Object.fromEntries(m.rooms.map(r=>[r.id,r]));
  for(const st of m.stations.filter(st=>st.kind!=='decon')){
    const r=roomBy[st.room];assert.ok(r,`sala da estação ${st.id} deve existir`);
    assert.ok(st.x>=r.x&&st.y>=r.y&&st.x+st.w<=r.x+r.w&&st.y+st.h<=r.y+r.h,`${st.id} deve ficar dentro da aparência da sala`);
    const edge=Math.min(st.x-r.x,r.x+r.w-(st.x+st.w),st.y-r.y,r.y+r.h-(st.y+st.h));
    assert.ok(edge<=2,`${st.id} deve permanecer próximo de um canto/borda e liberar o centro da sala`);
  }
  for(const d of m.decor)for(const st of m.stations.filter(st=>st.kind!=='decon')){
    assert.equal(rectOverlap(d,st),false,`${st.id} não deve ficar escondida dentro da decoração ${d.k}`);
  }
  assert.match(html,/Nuvens com sombra suave deixam o exterior da Nave legível/);
});

test('Nexus usa minigames próprios e exatamente a rede de dutos planejada',()=>{
  const m=mapLibrary().nexus;
  const rooms=new Set(m.vents.map(v=>v.room));
  assert.deepEqual([...rooms].sort(),['admin','balcony','cafe','decon','elec','lab','med','o2','reactor','ship','vision'].sort());
  assert.ok(!rooms.has('stor')&&!rooms.has('comm'),'Armazém e Comunicações não devem ter dutos');
  const norm=([a,b])=>[a,b].sort().join('|');
  const got=new Set(m.ventLinks.map(norm));
  const expected=[
    ['v_ship','v_reactor'],['v_ship','v_vision'],['v_reactor','v_lab'],['v_reactor','v_decon'],
    ['v_lab','v_decon'],['v_lab','v_elec'],['v_decon','v_vision'],['v_vision','v_med'],
    ['v_med','v_balcony'],['v_balcony','v_cafe'],['v_cafe','v_admin'],['v_admin','v_elec'],
    ['v_admin','v_o2'],['v_elec','v_o2']
  ].map(norm);
  assert.deepEqual([...got].sort(),expected.sort());
  const rectOverlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const v of m.vents){
    for(const st of m.stations.filter(st=>st.kind!=='decon'))assert.equal(rectOverlap({x:v.x,y:v.y,w:1,h:1},st),false,`${v.id} não pode ficar em cima da tarefa ${st.id}`);
    for(const d of m.decor.filter(d=>!['decon','balcony_hq'].includes(d.k)))assert.equal(rectOverlap({x:v.x,y:v.y,w:1,h:1},d),false,`${v.id} não pode ficar dentro da decoração ${d.k}`);
  }
  assert.doesNotMatch(html,/const d=roomDist\(from\.room,to\.room\).*return false/,'ligações diretas da rede de dutos não podem ser bloqueadas pela distância dos corredores');
  for(const game of ['nx_anomaly','nx_weather','nx_gases','nx_core','nx_circuit','nx_frequency','nx_landing','nx_cargo','nx_medscan','nx_records','nx_lenses','nx_supplies','nx_decon']){
    assert.match(html,new RegExp(`GAMES\\.${game}=`),`minigame ${game} deve existir`);
  }
  assert.match(html,/key:'nx_vision_lenses'.*game:'nx_lenses'/s);
  assert.match(html,/key:'nx_lab_anomaly'.*game:'nx_anomaly'/s);
  assert.match(html,/Atual: \$\{r\.value\}/,'controles de quantidade devem mostrar o valor atual ao jogador');
  assert.match(html,/if\(best\?\.type!=='decon'.*Entrar no duto/s,'controles da Descontaminação devem ter prioridade sobre dutos próximos');
});

test('interação das tarefas da Nexus é recalculada e fantasmas veem somente a própria posição no mapa',()=>{
  assert.match(html,/function stationUseRange\(s\)[\s\S]*ACTIVE_MAP_ID!=='nexus'[\s\S]*pendingAt\(s\?\.id\)\?82:68/);
  assert.match(html,/btnUse'\)\.addEventListener\('pointerdown'[\s\S]*const p=G\.player,a=bestAction\(\);G\.action=a/);
  assert.match(html,/Trocar fusíveis, fáceis de identificar[\s\S]*setLineDash\(\[8,5\]\)/);
  assert.match(html,/const showAll=observerAlive&&!commsDown/);
  assert.match(html,/const ownGhost=personalMap&&ch\.isPlayer&&!ch\.alive/);
});
