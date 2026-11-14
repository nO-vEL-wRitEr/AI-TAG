(()=>{'use strict';
const $=id=>document.getElementById(id), C=$('field');
let ctx=C.getContext('2d',{alpha:false});
const W=720,S=W/72,R=46,PI2=2*Math.PI, dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
// Mobile draws the same logical 720×720 world at 540 physical pixels for smoother performance.
const mobileViewport=window.matchMedia('(pointer: coarse)').matches;
if(mobileViewport){C.width=540;C.height=540;ctx.setTransform(.75,0,0,.75,0,0);}
const xp=x=>W/2+(x-state.camera.x)*S,yp=y=>W/2+(y-state.camera.y)*S;
const SKILLS={dash:10,freeze:16,blink:19};
const state={mode:'demo',difficulty:'normal',duration:'60',avatar:'girl',velocity:{x:0,y:0},motion:{lean:0,wind:0,speed:0,dir:0},relayWave:0,camera:{x:0,y:0},walk:0,facing:'down',running:false,paused:false,elapsed:0,player:{x:0,y:0},prev:{x:0,y:0},bots:[],cool:{dash:0,freeze:0,blink:0},attackCooldown:0,attackFlash:0,attackCount:0,dash:0,freeze:0,cloak:0,shield:0,invuln:0,level:1,score:0, gems:0,orb:null,stageSpawned:false,burstCycle:-1,warn:0,burst:0,lastKnown:{x:0,y:0},gpsWatch:null,gpsOrigin:null,accuracy:0,gpsLastFix:null,gpsUpdate:0,gpsHold:0,flash:0,eventUntil:0,previousTime:performance.now(),lastResult:'',particles:[]};
const press=new Set(), pointers=new Map();
// OOP refactor of the original AI-TAG 6.0 game.
// Responsibilities are grouped by gameplay systems; the existing canvas UI is retained.
class CombatSystem {
 constructor(state){this.state=state;}
canAttack(){return state.mode==='demo'&&state.difficulty!=='easy';}
attack(){
 if(!canAttack()||!state.running||state.paused||state.attackCooldown>.02)return;
 state.attackCooldown=4.5;state.attackFlash=.32;state.attackCount++;
 const vec={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}[state.facing]||{x:0,y:1};
 let hits=0;
 for(const bot of state.bots){
   const dx=bot.x-state.player.x,dy=bot.y-state.player.y;
   const d=Math.hypot(dx,dy)||.001;
   const facing=(dx*vec.x+dy*vec.y)/d;
   // A generous forward fan, but not a full-screen attack.
   if(d>8.8||facing<-.12)continue;
   const push=7.3*(state.difficulty==='hard'?.88:1);
   const moved=keepInside({x:bot.x+dx/d*push,y:bot.y+dy/d*push},R-2.1);
   bot.x=moved.x;bot.y=moved.y;
   bot.stun=state.difficulty==='hard'?1.1:1.65;
   hits++;
   emit(bot.x,bot.y,'#ffd48a',18);
 }
 state.score+=hits*90;
 emit(state.player.x+vec.x*3,state.player.y+vec.y*3,'#fff4b5',14);
 announce(hits?'💥 충격파 적중! 술래 '+hits+'명 밀어내기 · +'+hits*90+'점':'💫 충격파! 가까운 술래를 향해 사용해봐.',false,2);
 if(navigator.vibrate)try{navigator.vibrate(36)}catch(e){}
 updateHUD();
}
}
class GPSController {
 constructor(state){this.state=state;}
clearGps(){if(state.gpsWatch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(state.gpsWatch)}state.gpsWatch=null;state.gpsOrigin=null;state.gpsLastFix=null;state.gpsUpdate=0;state.accuracy=0;}
receiveGPS(position){if(!state.running||state.mode!=='gps')return;const c=position.coords;state.accuracy=c.accuracy;state.gpsUpdate=performance.now();if(c.accuracy>20){state.paused=true;pill('GPS 오차',true);announce('📍 위치 오차 '+Math.round(c.accuracy)+'m · 신호가 좋아질 때까지 멈춤',true,3);return;}
 if(!state.gpsOrigin){state.gpsOrigin={lat:c.latitude,lon:c.longitude};state.gpsLastFix={lat:c.latitude,lon:c.longitude,timestamp:position.timestamp};state.paused=false;pill('GPS 플레이');announce('✅ GPS 연결! 가상 공간에서 천천히 움직여.',false,3);return;}
 const x=(c.longitude-state.gpsOrigin.lon)*111320*Math.cos(state.gpsOrigin.lat*Math.PI/180),y=-(c.latitude-state.gpsOrigin.lat)*111320;const newP={x,y};const prev=state.gpsLastFix;const dt=prev?Math.max(.75,(position.timestamp-prev.timestamp)/1000):1;const moved=dist(newP,state.player);state.gpsLastFix={lat:c.latitude,lon:c.longitude,timestamp:position.timestamp};
 if((c.speed!==null&&c.speed>2.1)||(moved>5&&moved/dt>2.5)){state.paused=true;pill('이동 확인',true);announce('🚶 빠른 이동 또는 GPS 흔들림이 감지돼 멈췄어. 걷기 전용이야.',true,3);return;}
 if(Math.hypot(x,y)>R){state.paused=true;pill('범위 밖',true);announce('⚠️ 가상 경기장 밖이야. 안전한 위치로 돌아와줘.',true,3);return;}
 if(moved>.12){state.prev={x:clamp((newP.x-state.player.x)/dt,-1,1),y:clamp((newP.y-state.player.y)/dt,-1,1)};state.walk+=Math.min(3,moved)*2.7;state.facing=Math.abs(newP.x-state.player.x)>Math.abs(newP.y-state.player.y)?(newP.x>state.player.x?'right':'left'):(newP.y>state.player.y?'down':'up');}state.player=newP;state.paused=false;pill('GPS 플레이');
}
}
class DifficultyDirector {
 constructor(state){this.state=state;}
 step(t){
 const levelEvery=state.duration==='60'?10:state.duration==='300'?25:35;
 const lvl=Math.min(state.duration==='60'?6:8,1+Math.floor(t/levelEvery));
 if(lvl>state.level){state.level=lvl;state.flash=.5;announce('🔥 AI 속도 '+lvl+'단계! 술래가 더 빨라졌어!',true,2.8)}
 if(state.duration==='relay'){
   const newWave=Math.floor(t/45);
   if(newWave>state.relayWave){
     state.relayWave=newWave;
     // Relay: the oldest chaser leaves as fresh chasers take over; never an infinite crowd.
     const newRunner=randSpot(state.player,23);
     state.bots.push({...newRunner,id:newWave%2?'B':'A',offset:newWave,walk:0,facing:'down',stun:0});
     if(state.bots.length>2)state.bots.shift();
     state.score+=300+newWave*50;
     emit(state.player.x,state.player.y,'#8ef3b7',20);
     announce('🏁 '+newWave+'회 릴레이 통과! 새 술래 등장 · 보너스 +'+(300+newWave*50)+'점',false,4);
   }
 }else{
   const secondAt=state.duration==='60'?30:85;
   if(t>=secondAt&&!state.stageSpawned){state.stageSpawned=true;const p=randSpot(state.player,23);state.bots.push({...p,id:'B',offset:1,walk:0,facing:'down',stun:0});announce('🚨 두 번째 AI 술래가 출현했어!',true,3.3)}
 }
 const burstEvery=state.duration==='60'?16:30;const wave=Math.floor((t-17)/burstEvery);if(t>=17&&wave>state.burstCycle){state.burstCycle=wave;state.warn=1.8;state.burst=4.5;announce('⚠️ AI 폭주 예고! 곧 2.7초 동안 더 빨라져!',true,2.5)}
 }
}
class PlayerController {
 constructor(state){this.state=state;}
 step(dt){
 if(state.mode==='demo'){
   const v=getVector(),speed=8.9*(state.dash>0?2.0:1);
   // Ease into turns and coast naturally to rest; frame animation follows actual velocity.
   const pressed=Math.hypot(v.x,v.y)>.01;
   const alpha=1-Math.exp(-dt*(pressed?13.5:11.2));
   state.velocity.x+=(v.x-state.velocity.x)*alpha;
   state.velocity.y+=(v.y-state.velocity.y)*alpha;
   const motion=state.velocity;
   state.prev={x:motion.x,y:motion.y};
   const movingPower=Math.hypot(motion.x,motion.y);
   if(movingPower>.025){state.walk+=dt*(state.dash>0?23:15)*(.4+.6*Math.min(1,movingPower));state.facing=Math.abs(motion.x)>Math.abs(motion.y)?(motion.x>0?'right':'left'):(motion.y>0?'down':'up');}
   state.player=keepInside({x:state.player.x+motion.x*speed*dt,y:state.player.y+motion.y*speed*dt});
   if(state.orb&&dist(state.player,state.orb)<2.7){emit(state.orb.x,state.orb.y);state.gems++;state.score+=150;for(const k in state.cool)state.cool[k]=Math.max(0,state.cool[k]-2);spawnOrb();announce('💎 에너지 획득! +150점 · 초능력 대기시간 -2초!',false,2.1)}
 }
 }
}
class EnemyDirector {
 constructor(state){this.state=state;}
 step(dt){
 for(const bot of state.bots){bot.stun=Math.max(0,(bot.stun||0)-dt);let aim=state.player;
  if(state.cloak>0)aim=state.lastKnown;
  else if(bot.id==='B'&&state.mode==='demo')aim={x:state.player.x+state.prev.x*3,y:state.player.y+state.prev.y*3};
  const dx=aim.x-bot.x,dy=aim.y-bot.y,m=Math.hypot(dx,dy)||1;
  const diff=state.difficulty==='easy'?.82:state.difficulty==='hard'?1.17:1;
  let speed=state.mode==='demo'?(3.5+(state.level-1)*(state.duration==='60'?.81:.50))*(bot.id==='B'?.84:1)*diff:(.40+(state.level-1)*.04)*(bot.id==='B'?.65:1);
  if(state.burst>0&&state.warn<=0)speed*=state.mode==='demo'?1.36:1.12;
  if(state.freeze>0||bot.stun>0)speed=0;
  bot.x+=dx/m*speed*dt;bot.y+=dy/m*speed*dt;bot.walk=(bot.walk||0)+speed*dt*3.3;bot.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
  if(bot.stun<=0&&dist(bot,state.player)<(state.mode==='gps'?3.8:2.3)&&state.invuln<=0&&state.dash<=0&&state.shield<=0){
   if(state.mode==='gps'){state.gpsHold+=dt;if(state.gpsHold<1.4)continue;}
   emit(state.player.x,state.player.y,'#ff708d',22);finish(false,'🤖 잡혔어! 아이템과 초능력을 활용해서 다시 도전!');break;
  }
 }
 if(state.mode==='gps'&&state.bots.every(b=>dist(b,state.player)>=3.8))state.gpsHold=0;
 }
}
class CharacterMotionRig {
 constructor(state){this.state=state;}
 step(dt){
 const m=state.motion;
 const isActive=state.running&&!state.paused;
 const v=isActive?state.prev:{x:0,y:0};
 let speed=clamp(Math.hypot(v.x,v.y),0,1);
 if(state.mode==='gps'&&performance.now()-state.gpsUpdate>900)speed=0;
 const dash=state.dash>0&&state.mode==='demo'?1.65:1;
 const targetWind=speed*dash;
 const ease=(rate)=>1-Math.exp(-rate*Math.max(0,dt));
 m.speed+=(speed-m.speed)*ease(9);
 m.wind+=(targetWind-m.wind)*ease(4.8);
 const leanTarget=(v.x*.085+v.y*.025)*dash;
 m.lean+=(leanTarget-m.lean)*ease(6);
 m.dir+=(v.x-m.dir)*ease(4);

 }
}
const combatSystem=new CombatSystem(state);
const gpsController=new GPSController(state);
const difficultyDirector=new DifficultyDirector(state);
const playerController=new PlayerController(state);
const enemyDirector=new EnemyDirector(state);
const motionRig=new CharacterMotionRig(state);

let record=0;
function recordKey(){return 'ai-tag-chibi-v6-best-'+state.duration;}
function loadRecord(){try{record=Number(localStorage.getItem(recordKey())||0)||0;}catch(e){record=0;}$('record').textContent=record.toLocaleString('ko-KR');}
const lengthByMode={60:60,300:300,relay:Infinity};
function totalTime(){return lengthByMode[state.duration];}
function formatClock(sec){sec=Math.max(0,Math.floor(sec));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function modeHint(){return state.duration==='60'?'✨ AI는 10초마다 가속! 60초만 버티면 승리!':state.duration==='300'?'🕔 5분 생존전! AI는 25초마다 가속해.':'♾️ 무한 릴레이! 45초마다 새로운 술래가 바통을 이어받아.';}
function syncDurationUI(){
  document.querySelectorAll('[data-duration]').forEach(b=>{const on=b.dataset.duration===state.duration;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));b.disabled=state.running;});
  $('durationDesc').textContent=state.duration==='60'?'60초 동안 버티면 승리!':state.duration==='300'?'5분 동안 생존하기!':'45초마다 술래 교대 · 기록 도전';
  $('remainingLabel').textContent=state.duration==='relay'?'생존 시간':'남은 시간';
  loadRecord();
}
function chooseDuration(duration){if(state.running)return;state.duration=duration;reset();syncDurationUI();announce(modeHint(),false,999);}
loadRecord();
function announce(text,danger=false,seconds=2.6){$('event').textContent=text;$('event').classList.toggle('danger',danger);state.eventUntil=state.elapsed+seconds;}
function pill(text,danger=false){$('pill').textContent=text;$('pill').classList.toggle('red',danger)}
function keepInside(p,r=R-.8){let m=Math.hypot(p.x,p.y);if(m>r){p.x=p.x/m*r;p.y=p.y/m*r;}return p}
function randSpot(avoid,away=10){let p={x:0,y:0};for(let i=0;i<40;i++){const a=Math.random()*PI2,r=Math.sqrt(Math.random())*(R-4);p={x:Math.cos(a)*r,y:Math.sin(a)*r};if(!avoid||dist(p,avoid)>=away)break;}return p}
function emit(x,y,color='#ffe57d',count=12){for(let i=0;i<count;i++){const a=Math.random()*PI2,sp=2+Math.random()*8;state.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.45+Math.random()*.45,max:.9,color})}}
function spawnOrb(){if(state.mode!=='demo')return;state.orb=randSpot(state.player,9)}
function clearGps(){return gpsController.clearGps();}
function reset(){clearGps();Object.assign(state,{running:false,paused:false,elapsed:0,camera:{x:0,y:0},walk:0,facing:'down',player:{x:0,y:0},prev:{x:0,y:0},bots:[{x:23,y:15,id:'A',offset:0,walk:0,facing:'left',stun:0}],cool:{dash:0,freeze:0,blink:0},attackCooldown:0,attackFlash:0,attackCount:0,dash:0,freeze:0,cloak:0,shield:0,invuln:0,level:1,score:0,gems:0,orb:null,stageSpawned:false,burstCycle:-1,warn:0,burst:0,lastKnown:{x:0,y:0},gpsHold:0,flash:0,eventUntil:0,particles:[],relayWave:0,velocity:{x:0,y:0},motion:{lean:0,wind:0,speed:0,dir:0}});press.clear();pointers.clear();spawnOrb();updateHUD();}
function chooseMode(mode){if(state.running)finish(false,'게임을 종료했어.');reset();state.mode=mode;if(mode==='gps')state.orb=null;else spawnOrb();$('demoMode').classList.toggle('active',mode==='demo');$('gpsMode').classList.toggle('active',mode==='gps');$('controls').classList.toggle('hidden',mode==='gps');$('gemLegend').classList.toggle('hidden',mode==='gps');$('difficulty').disabled=mode==='gps';$('modeDesc').textContent=mode==='demo'?'방향키 / WASD 이동 · SPACE 공격(보통 이상)!':'위치 허용 후 안전한 곳에서 걷기로만 플레이!';$('dash').querySelector('.name').textContent=mode==='demo'?'⚡ 대시':'🫥 은신';$('dash').querySelector('.key').textContent=mode==='demo'?'1 · 잠깐 가속':'1 · 술래 시야 속이기';$('blink').querySelector('.name').textContent=mode==='demo'?'✨ 순간이동':'🛡️ 보호막';$('blink').querySelector('.key').textContent=mode==='demo'?'3 · 탈출':'3 · 일시적 보호';$('start').textContent='▶ 게임 시작';$('start').disabled=false;$('pause').disabled=true;$('pause').textContent='⏸ 일시정지';pill('시작 전');syncDurationUI();announce(mode==='demo'?modeHint():'📍 안전한 곳에서 멈춰 선 뒤 게임을 시작해. 이동 중 화면을 보지 마.',false,999);draw();}
function finish(won,message){if(!state.running)return;state.running=false;state.paused=false;clearGps();press.clear();pointers.clear();if(won)state.score+=(state.duration==='300'?1800:500);state.score=Math.round(state.score);if(state.score>record){record=state.score;try{localStorage.setItem(recordKey(),String(record))}catch(e){};$('record').textContent=record.toLocaleString('ko-KR');}pill(won?'🎉 생존 성공':'게임 종료',!won);announce(message|| (won?'🏆 생존 성공!':'🤖 잡혔어! 초능력을 쓰고 다시 도전해봐.'),!won,999);$('stop').classList.add('hidden');syncDurationUI();$('start').disabled=false;$('start').textContent='↻ 다시 도전';$('pause').disabled=true;$('pause').textContent='⏸ 일시정지';updateHUD();}
function start(){if(state.running)return;const mode=state.mode;reset();state.mode=mode;if(mode==='gps')state.orb=null;else spawnOrb();state.running=true;$('start').disabled=true;$('pause').disabled=false;$('stop').classList.remove('hidden');syncDurationUI();pill('생존 중');announce(mode==='demo'?'🏃 시작! 💎를 주우면서 술래를 피해봐!':'📍 위치 확인 중. 서 있는 상태에서 위치 권한을 허용해.',false,3);
 if(mode==='gps'){
   state.paused=true;pill('GPS 연결 중');if(!window.isSecureContext||!navigator.geolocation){finish(false,'❌ GPS는 HTTPS 사이트에서만 가능해. 화면 조작 모드를 먼저 이용해봐.');return;}
   state.gpsWatch=navigator.geolocation.watchPosition(receiveGPS,err=>{state.paused=true;pill('GPS 오류',true);announce('❌ 위치를 읽지 못했어: '+err.message,true,999);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 }
}
function receiveGPS(position){return gpsController.receiveGPS(position);}
function cast(which){if(!state.running||state.paused||state.cool[which]>0)return;state.cool[which]=SKILLS[which];if(which==='dash'){
  if(state.mode==='demo'){state.dash=1.15;state.invuln=.85;announce('⚡ 초고속 대시! 잠깐 동안 속도 2배!',false,2)}else{state.cloak=3;state.lastKnown={...state.player};announce('🫥 은신! 술래가 잠깐 네 위치를 잊었어.',false,2)}
 }else if(which==='freeze'){state.freeze=2.8;announce('❄️ 시간 정지! 2.8초 동안 술래들이 얼어붙었어.',false,2)}else{
   if(state.mode==='demo'){const b=closestBot(),p=state.player;let dx=p.x-b.x,dy=p.y-b.y,mag=Math.hypot(dx,dy);if(mag<.1){dx=1;dy=0;mag=1;}const old={...p};state.player=keepInside({x:p.x+dx/mag*15,y:p.y+dy/mag*15},R-1);if(dist(old,state.player)<7){const a=Math.atan2(p.y,p.x)+Math.PI/2;state.player=keepInside({x:p.x+Math.cos(a)*13,y:p.y+Math.sin(a)*13},R-1);}emit(old.x,old.y,'#bf9dff',18);emit(state.player.x,state.player.y,'#bf9dff',18);state.invuln=1.1;announce('✨ 순간이동 성공! 위험한 술래에게서 탈출!',false,2)}else{state.shield=4;announce('🛡️ 보호막! 4초 동안 잡히지 않아.',false,2)}
 }if(navigator.vibrate&&state.mode==='demo'){try{navigator.vibrate(28)}catch(e){}}updateHUD();}
function closestBot(){return state.bots.reduce((a,b)=>dist(state.player,a)<dist(state.player,b)?a:b)}
function canAttack(){return combatSystem.canAttack();}
function attack(){return combatSystem.attack();}
function getVector(){let dx=0,dy=0;const active=[...press,...pointers.values()];if(active.includes('ArrowUp')||active.includes('w')||active.includes('up'))dy--;if(active.includes('ArrowDown')||active.includes('s')||active.includes('down'))dy++;if(active.includes('ArrowLeft')||active.includes('a')||active.includes('left'))dx--;if(active.includes('ArrowRight')||active.includes('d')||active.includes('right'))dx++;let m=Math.hypot(dx,dy)||1;return{x:dx/m,y:dy/m};}
function update(dt,now){if(!state.running||state.paused)return;state.elapsed=Math.min(totalTime(),state.elapsed+dt);const t=state.elapsed;
 for(const k in state.cool)state.cool[k]=Math.max(0,state.cool[k]-dt);
 state.attackCooldown=Math.max(0,state.attackCooldown-dt);state.attackFlash=Math.max(0,state.attackFlash-dt);
 for(const k of ['dash','freeze','cloak','shield','invuln'])state[k]=Math.max(0,state[k]-dt);
 state.warn=Math.max(0,state.warn-dt);state.burst=Math.max(0,state.burst-dt);state.flash=Math.max(0,state.flash-dt);
 difficultyDirector.step(t);
 playerController.step(dt);
 state.score+=dt*10;
 enemyDirector.step(dt);
 if(state.running&&Number.isFinite(totalTime())&&t>=totalTime()){state.elapsed=totalTime();emit(state.player.x,state.player.y,'#6be8ba',30);finish(true,'🏆 '+(state.duration==='60'?'60초':'5분')+' 생존 성공! 에너지 '+state.gems+'개를 모았어!')}
 if(state.eventUntil<t&&state.running){announce(state.mode==='demo'?'💡 SPACE 충격파 공격(보통 이상) · 1 대시 · 2 시간 정지 · 3 순간이동!':'🚶 주변을 보며 천천히 움직여. 초능력은 화면이 아닌 안전한 곳에서 사용해.',false,4)}
}
function updateHUD(){const remain=Math.max(0,Math.ceil(totalTime()-state.elapsed));$('remaining').textContent=state.duration==='relay'?formatClock(state.elapsed):formatClock(remain);$('level').textContent=state.level;$('score').textContent=Math.round(state.score).toLocaleString('ko-KR');$('distance').textContent=state.bots.length?Math.max(0,Math.round(Math.min(...state.bots.map(b=>dist(state.player,b))))):'—';$('collected').textContent='💎 '+state.gems+'개';$('progress').style.width=(state.duration==='relay'?state.elapsed%45/45*100:state.elapsed/totalTime()*100)+'%';
 const attackBtn=$('attack'),attackReady=canAttack()&&state.running&&!state.paused&&state.attackCooldown<=.02;
 attackBtn.disabled=!attackReady;
 $('attackCool').textContent=!canAttack()?(state.mode==='gps'?'GPS 불가':'연습 불가'):state.attackCooldown>.02?state.attackCooldown.toFixed(1)+'초':'SPACE';
 $('attackInfo').textContent=state.mode==='gps'?'📍 GPS 모드에서는 공격할 수 없어.':state.difficulty==='easy'?'🔒 연습 난이도에서는 공격이 잠겨 있어. 보통 이상에서 사용 가능!':'보통·카오스: 스페이스 / 터치로 전방 충격파 · 4.5초 재사용';
 for(const key of ['dash','freeze','blink']){const b=$(key),cd=state.cool[key];b.disabled=!state.running||state.paused||cd>.01;b.classList.toggle('ready',state.running&&!state.paused&&cd<=.01);b.querySelector('.cool').textContent=cd>.01?cd.toFixed(1)+'초':'준비 완료';}
}
function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,PI2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
// Vector SD sprites: head, hairstyle, arms, feet and walking frames are all drawn locally.
function roundRect(g,x,y,w,h,r,fill,stroke,lw=1){r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}}
function ellipse(g,x,y,rx,ry,fill,stroke='',lw=1){g.beginPath();g.ellipse(x,y,rx,ry,0,0,PI2);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke()}}
function segment(g,x1,y1,x2,y2,color,lw,outline='#273143'){g.lineCap='round';g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=outline;g.lineWidth=lw+2.5;g.stroke();g.strokeStyle=color;g.lineWidth=lw;g.stroke()}
function drawAvatar(g,x,y,kind,phase=0,moving=false,scale=1,facing='down'){
 const bot=kind==='botA'||kind==='botB',girl=kind==='girl';
 const flip=facing==='left'?-1:1;
 const stride=moving?Math.sin(phase)*7:0;
 const step=moving?Math.abs(Math.sin(phase))*.7:0;
 const bounce=moving?Math.abs(Math.sin(phase))*2:Math.sin(performance.now()/550)*.5;
 const hoodie=bot?(kind==='botB'?'#ff9568':'#e95879'):(girl?'#ff8eac':'#549df4');
 const shade=bot?(kind==='botB'?'#a84044':'#a32c50'):(girl?'#b54576':'#2c5fa8');
 const skin=bot?'#e2bdd8':girl?'#ffe0bd':'#f8cfac';
 const hair=bot?'#572c60':girl?'#6c3a51':'#24374e';
 g.save();g.translate(x,y);g.scale(scale*flip,scale);g.lineJoin='round';
 ellipse(g,0,2,21,6,'#0b2b376b');
 // Moving sneakers and legs: opposite swing angles create a visible stride.
 const ldx=stride,rdx=-stride;
 segment(g,-7,-22,-8+ldx,-5,bot?'#48304c':'#273b60',9);
 segment(g,7,-22,8+rdx,-5,bot?'#48304c':'#273b60',9);
 ellipse(g,-8+ldx,-3+step,7.2,4.5,'#f6f7fc','#556677',1.1);
 ellipse(g,8+rdx,-3+(moving?.7-step:0),7.2,4.5,'#f6f7fc','#556677',1.1);
 g.translate(0,-bounce);
 // Back of long hair, or the enemy's hood.
 if(girl){roundRect(g,-22,-77,44,46,16,hair,'#40283b',2);ellipse(g,-19,-35,8,15,hair);ellipse(g,19,-35,8,15,hair)}
 // Arms swing opposite to legs.
 segment(g,-15,-35,-18-stride*.6,-21+Math.abs(stride)*.2,hoodie,8,'#223747');
 segment(g,15,-35,18+stride*.6,-21+Math.abs(stride)*.2,hoodie,8,'#223747');
 ellipse(g,-18-stride*.6,-19+Math.abs(stride)*.2,4.5,5,skin,'#735568',1);
 ellipse(g,18+stride*.6,-19+Math.abs(stride)*.2,4.5,5,skin,'#735568',1);
 // Chunky SD hoodie and collar. A thin outer flap reacts to horizontal movement.
 if(moving){g.save();g.translate(16,-34);g.rotate(Math.sin(phase*.7)*.14);g.beginPath();g.moveTo(0,-5);g.quadraticCurveTo(11,0,8,15);g.lineTo(2,9);g.closePath();g.fillStyle=shade;g.fill();g.restore();}
 roundRect(g,-17,-43,34,28,11,hoodie,shade,2);
 roundRect(g,-13,-25,26,5,3,shade);
 roundRect(g,-4,-39,8,8,3,bot?'#ffd374':girl?'#ffe5e9':'#b7ddff');
 segment(g,-5,-34,-5,-28,'#f1f2f7',1.3, '#f1f2f7');segment(g,5,-34,5,-28,'#f1f2f7',1.3,'#f1f2f7');
 // Oversized face: chibi proportions with rounded outline and expressive eyes.
 ellipse(g,0,-60,23.5,24.5,skin,'#67495e',2.1);
 ellipse(g,-20,-57,4,6,skin,'#67495e',1);
 ellipse(g,20,-57,4,6,skin,'#67495e',1);
 // Hairstyles.
 if(girl){
   g.beginPath();g.moveTo(-22,-65);g.quadraticCurveTo(-29,-91,0,-87);g.quadraticCurveTo(26,-94,23,-65);g.lineTo(14,-69);g.quadraticCurveTo(0,-59,-11,-70);g.lineTo(-22,-65);g.closePath();g.fillStyle=hair;g.fill();
   ellipse(g,17,-75,7,9,'#7f4a63');roundRect(g,12,-84,12,6,3,'#ffcf68');
 }else if(bot){
   g.beginPath();g.moveTo(-23,-62);g.quadraticCurveTo(-29,-92,0,-89);g.quadraticCurveTo(24,-91,24,-62);g.lineTo(13,-70);g.lineTo(6,-66);g.lineTo(-3,-73);g.lineTo(-15,-65);g.closePath();g.fillStyle=hair;g.fill();
   g.beginPath();g.moveTo(-15,-86);g.lineTo(-20,-101);g.lineTo(-4,-90);g.closePath();g.fillStyle=hoodie;g.fill();
   g.beginPath();g.moveTo(10,-88);g.lineTo(21,-100);g.lineTo(20,-80);g.closePath();g.fillStyle=hoodie;g.fill();
 }else{
   g.beginPath();g.moveTo(-23,-63);g.lineTo(-22,-78);g.lineTo(-15,-87);g.lineTo(-11,-81);g.lineTo(-4,-90);g.lineTo(3,-83);g.lineTo(12,-90);g.lineTo(21,-79);g.lineTo(23,-66);g.lineTo(10,-72);g.lineTo(-2,-70);g.lineTo(-12,-74);g.closePath();g.fillStyle=hair;g.fill();
   ellipse(g,-17,-76,7,5,'#345269');
 }
 // Eyes look toward movement direction. Backward view uses a smaller face.
 if(facing!=='up'){
   const eyeShift=facing==='right'?2:facing==='left'?-2:0;
   ellipse(g,-8+eyeShift,-57,3.3,5.4,'#2c3547');ellipse(g,8+eyeShift,-57,3.3,5.4,'#2c3547');
   ellipse(g,-9+eyeShift,-59,1.3,1.8,'#fff');ellipse(g,7+eyeShift,-59,1.3,1.8,'#fff');
   ellipse(g,-15,-50,4,1.8,'#f18aa2aa');ellipse(g,15,-50,4,1.8,'#f18aa2aa');
   g.beginPath();g.arc(0,-49,3.2,.13,Math.PI-.13);g.strokeStyle='#9a5872';g.lineWidth=1.6;g.stroke();
 }else{ellipse(g,0,-64,15,7,hair)}
 if(bot){ellipse(g,0,-45,4,2,'#9b4872')}
 g.restore();
}
 // Sprite assets are loaded from artwork.js
 const sourceIllustration=window.AITagArtwork;
// Reduce per-frame bitmap scaling cost on mobile.
const spriteCache=new Map();
function spriteFor(kind){
 const src=sourceIllustration[kind];
 if(!src||!src.complete||!src.naturalWidth)return src;
 const existing=spriteCache.get(kind);
 if(existing&&existing.source===src)return existing.canvas;
 const buffer=document.createElement('canvas'),factor=.33;
 buffer.width=Math.max(1,Math.round(src.naturalWidth*factor));
 buffer.height=Math.max(1,Math.round(src.naturalHeight*factor));
 const painter=buffer.getContext('2d');
 painter.imageSmoothingQuality='high';
 painter.drawImage(src,0,0,buffer.width,buffer.height);
 spriteCache.set(kind,{source:src,canvas:buffer});
 return buffer;
}
// Spring-based smoothing keeps idle, acceleration, steps and stopping continuous.
function updateMotion(dt){return motionRig.step(dt);}
function drawHairMotion(g,phase,m){
 if(m.wind<.04)return;
 const t=performance.now()/200;
 const bend= Math.sin(t+phase*.16)*2.4*m.wind -m.dir*7*m.wind;
 g.save();
 g.lineCap='round';g.lineJoin='round';
 // Finer, curved hair strands behind shoulders, bending with inertia.
 for(let i=0;i<4;i++){
   const sx=(i%2===0?-1:1)*(20+i*3.0);
   const sy=-85+(i%3)*7;
   g.beginPath();g.moveTo(sx,sy);
   g.bezierCurveTo(sx-3*m.dir,sy+12,sx+bend*.8,sy+25,sx+bend*1.3+(i%2?4:-4),sy+30+i*2);
   g.strokeStyle=i%2?'#332327':'#473039';g.lineWidth=2.3-i*.25;g.stroke();
   g.beginPath();g.moveTo(sx+.5,sy+1);g.quadraticCurveTo(sx+bend,sy+20,sx+bend*1.25+(i%2?4:-4),sy+30+i*2);
   g.strokeStyle='#746064';g.lineWidth=.45;g.stroke();
 }
 g.restore();
}
function drawClothFlutter(g,phase,m){
 if(m.wind<.045)return;
 const move=Math.sin(phase*.82)*2.5*m.wind;
 const tail=m.wind*4.2;
 g.save();g.lineJoin='round';
 // Two burgundy ribbon tails, pivoted at the actual bow under her collar.
 for(const side of [-1,1]){
  g.save();g.translate(side*3,-70);g.rotate((side*.11+m.dir*.15+Math.sin(phase*.78+side)*.13)*m.wind);
  g.beginPath();g.moveTo(-2,0);g.quadraticCurveTo(-4+move*side,7+tail*.2,-5+move*side,13+tail);
  g.lineTo(-.2+move*.55,11+tail*.75);g.lineTo(3,0);g.closePath();
  g.fillStyle=side<0?'#8f3f54':'#943d4e';g.strokeStyle='#4e2932';g.lineWidth=1;g.fill();g.stroke();
  g.beginPath();g.moveTo(-1,2);g.quadraticCurveTo(-1+move,8,-1+move,10+tail*.6);g.strokeStyle='#bc747b';g.lineWidth=.7;g.stroke();
  g.restore();
 }
 // Jacket hem flaps fan slightly outwards while moving.
 for(const side of [-1,1]){
  g.save();g.translate(side*20,-40);g.rotate(side*(.10+.12*m.wind)+Math.sin(phase*.6+side)*.035*m.wind);
  g.beginPath();g.moveTo(-4,-4);g.quadraticCurveTo(side*3,5,-2+side*3,9+tail*.55);
  g.quadraticCurveTo(-5+side*2,10,-7,5);g.closePath();g.fillStyle='#34323c';g.strokeStyle='#24232e';g.lineWidth=1.1;g.fill();g.stroke();g.restore();
 }
 g.restore();
}
// Natural 2D skeletal walking using separate, fixed-pivot original-art legs.
function drawUserChibi(g,x,y,phase,moving,scale=1,facing='down'){
 const art=sourceIllustration,body=art.body;
 if(!body.complete||!body.naturalWidth){drawAvatar(g,x,y,'girl',phase,moving,scale,facing);return;}
 const m=state.motion;
 const activity=clamp(m.speed,0,1);
 const stepSize=Math.min(1,activity*1.25);
 const wave=Math.sin(phase);
 const bob=moving?1.4*Math.abs(Math.sin(phase))*stepSize:Math.sin(performance.now()/650)*.35;
 const k=.18*scale;
 const shoulderY=-(269+580)*k;
 const waistY=-269*k;
 const legTopY=-(269-58)*k;
 g.save();g.translate(x,y);g.scale(facing==='left'?-1:1,1);
 ellipse(g,0,1.5*scale,20*scale,4.8*scale,'#10242f7b');
 g.translate(0,-bob*scale);
 // Pivot points sampled from the straight-leg reference, not guessed per sprite.
 function leg(which,theta,lift){
   const im=art[which];if(!im.complete||!im.naturalWidth)return;
   const left=which==='left',hipX=(left?63:126)-93.5;
   const localX=left?37:36;
   g.save();g.translate(hipX*k,legTopY);
   g.rotate(theta);
   // The swing leg lifts slightly, while the stance leg remains planted.
   g.translate(0,-lift*scale);
   g.drawImage(spriteFor(which),-localX*k,0,im.width*k,im.height*k);
   g.restore();
 }
 // Two sine-phased articulated legs; zero swing in idle and no frame popping.
 const angle=.21*stepSize*wave;
 const liftL=Math.max(0,wave)*3.6*stepSize;
 const liftR=Math.max(0,-wave)*3.6*stepSize;
 if(wave>=0){leg('right',-angle,liftR);leg('left',angle,liftL)}
 else {leg('left',angle,liftL);leg('right',-angle,liftR)}
 if(art.skirt.complete&&art.skirt.naturalWidth)g.drawImage(spriteFor('skirt'),-93.5*k,waistY,188*k,86*k);
 // Body is attached over the skirt at a *fixed* waist pivot regardless of gait.
 g.save();const pivotY=waistY+16*scale;
 g.translate(0,pivotY);
 g.rotate(m.lean*(facing==='left'?-1:1)+Math.sin(phase*.7)*.008*m.wind);
 g.translate(-m.dir*1.3*scale,-pivotY);
 g.drawImage(spriteFor('body'),-380*k,shoulderY,body.width*k,body.height*k);
 g.save();g.scale(scale,scale);drawHairMotion(g,phase,m);drawClothFlutter(g,phase,m);g.restore();
 g.restore();g.restore();
}

function selectAvatar(who){state.avatar=who;for(const kind of ['boy','girl']){const el=$(kind+'Choice');const on=kind===who;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));}}
function drawPreviews(){const tm=performance.now()/1000;for(const type of ['boy','girl']){const c=$(type+'Preview'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);const grad=g.createRadialGradient(65,90,6,65,85,70);grad.addColorStop(0,type==='boy'?'#41718d':'#865c7b');grad.addColorStop(1,'#153749');g.fillStyle=grad;roundRect(g,2,2,126,124,16,grad);ellipse(g,65,119,38,5,'#0c203e88');if(type==='girl')drawUserChibi(g,65,126,tm*11,true,.76,'down');else drawAvatar(g,65,120,type,tm*8,true,1.13,'down')}}
const FLOWERS=[[-34,15],[-29,-17],[-9,28],[16,27],[32,-18],[-31,-30],[30,30],[12,-31],[39,6],[-12,-35]];
const TREES=[[-34,-29],[-39,7],[-33,30],[-24,37],[-18,-30],[-4,-38],[7,-34],[20,-35],[34,-27],[36,20],[26,34],[-38,-12],[-26,-37],[3,39],[-7,36],[39,-5]];
function drawTree(x,y,size=1){const ax=xp(x),ay=yp(y);ellipse(ctx,ax+2,ay+7,14*size,6*size,'#1835276b');roundRect(ctx,ax-4*size,ay-6*size,8*size,18*size,2*size,'#765844');circle(ax-8*size,ay-10*size,17*size,'#246d68');circle(ax+7*size,ay-15*size,17*size,'#2c8973');circle(ax-3*size,ay-23*size,18*size,'#3b9a79');circle(ax-5*size,ay-24*size,5*size,'#68c79842')}
const GROUND_MARGIN=170;
let groundCache=null;
function paintGround(){
 if(!groundCache){
  const onscreen=ctx,oldX=state.camera.x,oldY=state.camera.y;
  groundCache=document.createElement('canvas');
  groundCache.width=W+GROUND_MARGIN*2;
  groundCache.height=W+GROUND_MARGIN*2;
  ctx=groundCache.getContext('2d',{alpha:false});
  state.camera.x=0;state.camera.y=0;
  ctx.translate(GROUND_MARGIN,GROUND_MARGIN);
  drawGround();
  ctx=onscreen;state.camera.x=oldX;state.camera.y=oldY;
 }
 ctx.drawImage(groundCache,GROUND_MARGIN+Math.round(state.camera.x*S),GROUND_MARGIN+Math.round(state.camera.y*S),W,W,0,0,W,W);
}
function drawGround(){
 ctx.save();ctx.fillStyle='#071a29';ctx.fillRect(-GROUND_MARGIN,-GROUND_MARGIN,W+GROUND_MARGIN*2,W+GROUND_MARGIN*2);
 const cx=xp(0),cy=yp(0),radius=R*S;
 ctx.beginPath();ctx.arc(cx,cy,radius,0,PI2);ctx.clip();
 const grass=ctx.createLinearGradient(0,0,W,W);grass.addColorStop(0,'#285d57');grass.addColorStop(1,'#1b4845');ctx.fillStyle=grass;ctx.fillRect(-GROUND_MARGIN,-GROUND_MARGIN,W+GROUND_MARGIN*2,W+GROUND_MARGIN*2);
 // Athletic field paving and light park trails; decorations do not block the player.
 ctx.strokeStyle='#436e64';ctx.lineWidth=1.2;
 for(let v=-R;v<=R;v+=5){ctx.beginPath();ctx.moveTo(xp(v),-GROUND_MARGIN);ctx.lineTo(xp(v),W+GROUND_MARGIN);ctx.moveTo(-GROUND_MARGIN,yp(v));ctx.lineTo(W+GROUND_MARGIN,yp(v));ctx.stroke();}
 ctx.strokeStyle='#a4b8a064';ctx.lineWidth=24;ctx.beginPath();ctx.moveTo(xp(-R),yp(0));ctx.lineTo(xp(R),yp(0));ctx.moveTo(xp(0),yp(-R));ctx.lineTo(xp(0),yp(R));ctx.stroke();
 ctx.strokeStyle='#c3c2a67b';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(xp(-R),yp(0));ctx.lineTo(xp(R),yp(0));ctx.moveTo(xp(0),yp(-R));ctx.lineTo(xp(0),yp(R));ctx.stroke();
 // Painted dashed running lanes.
 ctx.save();ctx.setLineDash([10,17]);ctx.strokeStyle='#fff8dc50';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xp(-R),yp(0));ctx.lineTo(xp(R),yp(0));ctx.moveTo(xp(0),yp(-R));ctx.lineTo(xp(0),yp(R));ctx.stroke();ctx.restore();
 for(const [fx,fy] of FLOWERS){for(let k=0;k<5;k++){const px=xp(fx+Math.sin(k*2)*1.3),py=yp(fy+Math.cos(k*3)*1.4);circle(px,py,2.2,k%2?'#ffe5a0':'#eac8f3');}}
 for(const [tx,ty] of TREES){drawTree(tx,ty,1.02)}
 ctx.restore();
 ctx.beginPath();ctx.arc(cx,cy,radius,0,PI2);ctx.setLineDash([13,8]);ctx.strokeStyle=state.flash>0?'#ff99ae':'#9fe7b5';ctx.lineWidth=5;ctx.stroke();ctx.setLineDash([]);
}
function drawMiniMap(){const mw=135,mh=141,mx=W-mw-16,my=15;
 roundRect(ctx,mx,my,mw,mh,15,'#061926e8','#a9d7dc8c',2);
 ctx.fillStyle='#d6f3f8';ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillText('전체 맵',mx+mw/2,my+19);
 const rad=51,cx=mx+mw/2,cy=my+82,ratio=rad/R;
 circle(cx,cy,rad,'#2d6c59','#85ccb5',2);
 ctx.strokeStyle='#c4bb9466';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(cx-rad,cy);ctx.lineTo(cx+rad,cy);ctx.moveTo(cx,cy-rad);ctx.lineTo(cx,cy+rad);ctx.stroke();
 for(const b of state.bots)circle(cx+b.x*ratio,cy+b.y*ratio,4.2,'#ff7890','#ffcbd4',.8);
 if(state.orb)circle(cx+state.orb.x*ratio,cy+state.orb.y*ratio,3.1,'#ffda6b');
 circle(cx+state.player.x*ratio,cy+state.player.y*ratio,5.2,'#5db7ff','#fff',1.5);
 ctx.fillStyle='#b3d7df';ctx.font='10px system-ui';ctx.fillText('파랑 = 나 / 빨강 = 술래',mx+mw/2,my+132);
}
function draw(){
 const glow=.5+Math.sin(performance.now()/260)*.5;
 paintGround();
 if(state.mode==='gps'&&state.accuracy>0)circle(xp(state.player.x),yp(state.player.y),Math.min(25,state.accuracy)*S,'#58a8ff22');
 if(state.orb){const x=xp(state.orb.x),y=yp(state.orb.y);circle(x,y,21+glow*9,'#ffce5440');ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillStyle='#ffd76b';ctx.fillRect(-9,-9,18,18);ctx.fillStyle='#fff6ce';ctx.fillRect(-4,-4,8,8);ctx.restore()}
 // Bot shadows, then full animated SD pursuers.
 for(const b of state.bots){const x=xp(b.x),y=yp(b.y),fr=state.burst>0&&state.warn<=0;circle(x,y-35,37+glow*5,fr?'#ef45634c':'#ef456326');drawAvatar(ctx,x,y,b.id==='B'?'botB':'botA',b.walk,state.running&&!state.paused&&state.freeze<=0&&b.stun<=0,1.05,b.facing);if(fr)circle(x,y-45,37,null,'#ffa6b4',3);if(b.stun>0){ctx.fillStyle='#ffe4a1';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText('✦ ✦',x,y-103);}if(state.freeze>0){ctx.fillStyle='#b7f3ff';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('❄',x+24,y-92)}}
 const x=xp(state.player.x),y=yp(state.player.y);
 if(state.dash>0)circle(x,y-37,41+glow*3,'#64f6c64c');
 if(state.cloak>0)circle(x,y-37,43+glow*3,'#d4f8fb22');
 const moving=state.running&&!state.paused&&state.motion.speed>.08;
 if(state.avatar==='girl')drawUserChibi(ctx,x,y,state.walk,moving,1.0,state.facing);else drawAvatar(ctx,x,y,state.avatar,state.walk,moving,1.13,state.facing);
   if(state.attackFlash>0){
    const pct=1-state.attackFlash/.32, dir={up:-Math.PI/2,down:Math.PI/2,left:Math.PI,right:0}[state.facing]??Math.PI/2;
    ctx.save();ctx.globalAlpha=clamp(1-pct,0,1)*.9;ctx.strokeStyle='#ffe3a6';ctx.lineWidth=9-5*pct;ctx.lineCap='round';ctx.beginPath();ctx.arc(x,y-35,25+pct*77,dir-1.15,dir+1.15);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(x,y-35,35+pct*77,dir-.75,dir+.75);ctx.stroke();ctx.restore();
  }
  if(state.shield>0||state.invuln>0)circle(x,y-48,49,null,'#ffe9a0',4);
 for(const p of state.particles){const a=Math.max(0,Math.min(1,p.life/p.max));ctx.globalAlpha=a;circle(xp(p.x),yp(p.y),3.5,p.color)}ctx.globalAlpha=1;
 // HUD and compass are pinned to the viewport, even when the world scrolls.
 roundRect(ctx,13,13,255,51,12,'#061926cb');ctx.fillStyle='#e2f6fb';ctx.font='bold 17px system-ui';ctx.textAlign='left';ctx.fillText('AI TAG · COMBAT & RIG',25,36);
 ctx.fillStyle=state.warn>0?'#ffc3cd':'#a3d5de';ctx.font='13px system-ui';ctx.fillText(state.warn>0?'⚠ 폭주까지 '+state.warn.toFixed(1)+'초':state.burst>0?'🔥 AI 폭주 중!':('AI 속도 '+state.level+'단계'),25,54);
 drawMiniMap();
 if(!state.running&&!state.elapsed){roundRect(ctx,114,292,492,105,20,'#082a39d9','#86bdc3');ctx.textAlign='center';ctx.font='bold 29px system-ui';ctx.fillStyle='#fff';ctx.fillText('캐릭터와 시간을 선택해!',360,338);ctx.font='18px system-ui';ctx.fillStyle='#b8f6db';ctx.fillText('🎈 고정 관절 다리 · 스페이스 충격파',360,371)}
 if(state.running&&state.paused){ctx.fillStyle='#001726bf';ctx.fillRect(0,0,W,W);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 35px system-ui';ctx.fillText('⏸ 일시정지',W/2,335);ctx.font='18px system-ui';ctx.fillText(state.mode==='gps'?'GPS 신호 확인 중':'재개 버튼을 눌러줘',W/2,369)}
}

// Decouple physics from rendering so frame drops cannot slow down the enemies.
const FIXED_STEP=1/60,MAX_FRAME_DELTA=.25,MAX_SIM_STEPS=15;
const targetFrameMs=window.matchMedia('(pointer: coarse)').matches?1000/30:1000/60;
let physicsAccumulator=0;
let lastTickTime=performance.now(),lastPaintTime=0,lastHUDTime=-1000,lastPreviewTime=-1000;
function frame(now){
 requestAnimationFrame(frame);
 const rawDelta=Math.max(0,(now-lastTickTime)/1000);
 lastTickTime=now;
 if(document.hidden){physicsAccumulator=0;return;}
 physicsAccumulator=Math.min(MAX_FRAME_DELTA,physicsAccumulator+Math.min(MAX_FRAME_DELTA,rawDelta));
 let steps=0;
 while(physicsAccumulator>=FIXED_STEP&&steps<MAX_SIM_STEPS){
  if(state.running&&state.mode==='gps'&&state.gpsUpdate&&now-state.gpsUpdate>15000){
   state.paused=true;pill('GPS 대기',true);
  }
  update(FIXED_STEP,now);
  updateMotion(FIXED_STEP);
  for(const p of state.particles){p.x+=p.vx*FIXED_STEP;p.y+=p.vy*FIXED_STEP;p.life-=FIXED_STEP;}
  physicsAccumulator-=FIXED_STEP;
  steps++;
 }
 if(steps===MAX_SIM_STEPS)physicsAccumulator=0;
 if(now-lastPaintTime<targetFrameMs-1)return;
 const renderDelta=Math.min(.1,(now-lastPaintTime)/1000);
 lastPaintTime=now;
 const limit=Math.max(0,R-W/(2*S)+1);
 const cameraAlpha=1-Math.exp(-4.7*renderDelta);
 state.camera.x=clamp(state.camera.x+(state.player.x-state.camera.x)*cameraAlpha,-limit,limit);
 state.camera.y=clamp(state.camera.y+(state.player.y-state.camera.y)*cameraAlpha,-limit,limit);
 if(!state.running&&now-lastPreviewTime>450){drawPreviews();lastPreviewTime=now;}
 state.particles=state.particles.filter(p=>p.life>0).slice(-100);
 if(now-lastHUDTime>120){updateHUD();lastHUDTime=now;}
 draw();
}

/** Public façade for debugging and future modular extensions. */
class AITagGame {
 constructor(){this.state=state;this.combat=combatSystem;this.gps=gpsController;this.enemyAI=enemyDirector;this.player=playerController;this.motion=motionRig;}
 start(){start();}
 stop(){finish(false,'게임을 종료했어.');}
 selectCharacter(kind){selectAvatar(kind);}
 setDuration(duration){chooseDuration(duration);}
 useSkill(name){cast(name);}
 attack(){return this.combat.attack();}
 get status(){return {running:state.running,mode:state.mode,elapsed:state.elapsed,score:state.score};}
}
window.aiTag=new AITagGame();
$('boyChoice').addEventListener('click',()=>selectAvatar('boy'));
$('girlChoice').addEventListener('click',()=>selectAvatar('girl'));
$('demoMode').addEventListener('click',()=>chooseMode('demo'));
$('gpsMode').addEventListener('click',()=>chooseMode('gps'));
$('difficulty').addEventListener('change',e=>state.difficulty=e.target.value);
document.querySelectorAll('[data-duration]').forEach(b=>b.addEventListener('click',()=>chooseDuration(b.dataset.duration)));
$('stop').addEventListener('click',()=>{if(state.running)finish(false,'■ 기록을 저장하고 게임을 종료했어. 다시 도전할 수 있어!');});
$('start').addEventListener('click',start);
$('pause').addEventListener('click',()=>{if(!state.running)return;if(state.mode==='gps'){announce('📍 GPS 모드는 위치 신호에 따라 자동 일시정지돼.',false,3);return;}state.paused=!state.paused;pill(state.paused?'일시정지':'생존 중');$('pause').textContent=state.paused?'▶ 재개':'⏸ 일시정지';announce(state.paused?'⏸ 잠깐 쉬는 중':'▶ 다시 시작!',false,2);});
for(const key of ['dash','freeze','blink'])$(key).addEventListener('click',()=>cast(key));
$('attack').addEventListener('click',attack);
document.addEventListener('keydown',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','1','2','3',' '].includes(k))e.preventDefault();
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k))press.add(k);
 if(e.repeat)return;
 if(k===' ')attack();if(k==='1')cast('dash');if(k==='2')cast('freeze');if(k==='3')cast('blink');
 if(k==='p'&&state.mode==='demo'&&state.running)$('pause').click();
});
document.addEventListener('keyup',e=>press.delete(e.key.length===1?e.key.toLowerCase():e.key));
window.addEventListener('blur',()=>{press.clear();pointers.clear();if(state.running&&state.mode==='demo'&&!state.paused){state.paused=true;pill('일시정지');$('pause').textContent='▶ 재개'}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused){state.paused=true;pill('일시정지');if(state.mode==='demo')$('pause').textContent='▶ 재개'}});
document.querySelectorAll('[data-dir]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();pointers.set(e.pointerId,b.dataset.dir);b.setPointerCapture(e.pointerId)});const up=e=>{pointers.delete(e.pointerId)};b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up)});
selectAvatar('girl');chooseMode('demo');syncDurationUI();state.previousTime=performance.now();requestAnimationFrame(frame);
})();
