let stageStartTime = 0;

let timerStopped = false;

stageStartTime = performance.now();

function formatTime(ms) {
  const totalMs = Math.floor(ms);

  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis  = totalMs % 1000;

  const mm  = String(minutes).padStart(2, '0');
  const ss  = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${mm}.${ss}.${mmm}`;
}

function isMobile(){
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  );
}

if (isMobile()) {
  // Show notice and enable mobile touch controls (don't disable start)
  const mn = document.getElementById('mobileNotice'); if (mn) mn.style.display = 'block';
  const sb = document.getElementById('startBtn'); if (sb) { sb.disabled = false; sb.style.opacity = '1'; sb.style.cursor = 'pointer'; }

  // show floating menu button on small screens
  const mb = document.getElementById('menuBtn'); if (mb) mb.style.display = 'block';

  // map touch/pointer to keys
  const mapButton = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); keys[key] = true; };
    const up = (e) => { e.preventDefault(); keys[key] = false; };
    el.addEventListener('touchstart', down, { passive: false }); el.addEventListener('touchend', up);
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up);
    el.addEventListener('mousedown', down); el.addEventListener('mouseup', up);
  };
  mapButton('touch-left', 'KeyA');
  mapButton('touch-right', 'KeyD');
  mapButton('touch-jump', 'Space');
  mapButton('touch-dash', 'ShiftLeft');
  
  // Direct reset button handler (not mapped through keys system)
  const resetBtn = document.getElementById('touch-reset');
  if (resetBtn) {
    const resetDown = (e) => { e.preventDefault(); resetStage(); };
    resetBtn.addEventListener('touchstart', resetDown, { passive: false });
    resetBtn.addEventListener('pointerdown', resetDown);
    resetBtn.addEventListener('mousedown', resetDown);
  }
}


const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');

function playMenuOpen(){
  if(!soundEnabled) return;

  // 두 (낮은데 존재감 있게)
  playTone(180, 0.16, 'triangle', 0.22, 0.04);

  // 둔! (높고 또렷)
  setTimeout(() => {
    playTone(480, 0.08, 'triangle', 0.18, 0.01);
  }, 140);
}

function playMenuClose(){
  if(!soundEnabled) return;
  // 툭 (짧고 가벼운 클릭감)
  playTone(320, 0.05, 'square', 0.12, 0.005);
}

menuBtn.addEventListener('click', () => {
  keys = {};
  if (window.gameState === 'playing') {
    // 메뉴 열기
    window.gameState = 'menu';
    menu.style.display = 'flex';
    menuBtn.textContent = '✕';
    playMenuOpen();   // ← 사운드
  } else {
    // 메뉴 닫기
    window.gameState = 'playing';
    menu.style.display = 'none';
    menuBtn.textContent = '☰';
    playMenuClose();
  }
});

menuBtn.addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
});

let soundEnabled = true;
const soundToggle = document.getElementById('soundToggle');
soundEnabled = soundToggle.checked;

soundToggle.addEventListener('change', () => {
  soundEnabled = soundToggle.checked;
});
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; if(e.code === 'KeyR') resetStage(); });
document.addEventListener('keyup', e => keys[e.code] = false);

class Rect { constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h}
  get left(){return this.x} get right(){return this.x+this.w}
  get top(){return this.y} get bottom(){return this.y+this.h}
}

class Player {
  constructor(x,y){
    this.x=x; this.y=y; this.w=40; this.h=40; // perfect square avatar for collision
    this.vx=0; this.vy=0; this.ax=0; this.ay=0;
    this.onGround=false; this.facing=1; this.dashCD=0;
    // visual scaling for squash/stretch
    this.scaleX = 1; this.scaleY = 1;
    this.targetScaleX = 1; this.targetScaleY = 1;
    // jump state for double jump
    this.jumpCount = 0;
    this.maxJumps = 2;
    this._jumpHeld = false; // for edge detection (prevent hold-to-repeat)
  }
  handle(){
    this.ax = 0;
    if(keys['KeyA']) { this.ax = -0.9; this.facing=-1 }
    if(keys['KeyD']) { this.ax = 0.9; this.facing=1 }
    // jump on key down (edge) to support double jump without holding
    if(keys['Space'] || keys['KeyW']){ if(!this._jumpHeld){ this.jump(); this._jumpHeld = true } }
    else { this._jumpHeld = false }
    if(keys['ShiftLeft']) this.dash();
  }
  jump(){ 
    // allow double jump: up to maxJumps presses before landing
    if(this.jumpCount < this.maxJumps){
      this.vy = -16; this.onGround = false; this.jumpCount += 1;
      // visual: taller and narrower when jumping (vertical squash)
      this.targetScaleX = 0.8; this.targetScaleY = 1.25;
      playJump();
    }
  }
  dash(){ if(this.dashCD<=0){ this.vx += 18*this.facing; this.dashCD = 60; playDash(); }}
  update(plats){
    const GRAV = 0.8; const FRI = -0.12;
    this.ay = GRAV; this.ax += this.vx * FRI;
    this.vx += this.ax; this.vy += this.ay;
    if(this.vx>12) this.vx=12; if(this.vx<-12) this.vx=-12;

    // horizontal
    this.x += (this.vx + 0.5*this.ax)|0;
    // collide with static platforms
    for(let p of (plats||[])) if(collideRect(this,p)){ if(this.vx>0){ this.x = p.x - this.w; this.vx=0 } else if(this.vx<0){ this.x = p.x + p.w; this.vx=0 }}
    // collide with walls (horizontal)
    for(let w of (walls||[])) if(collideRect(this,w)){ if(this.vx>0){ this.x = w.x - this.w; this.vx=0 } else if(this.vx<0){ this.x = w.x + w.w; this.vx=0 }}

    // vertical
    const prevOnGround = this.onGround;
    this.y += (this.vy + 0.5*this.ay)|0; this.onGround=false;
    for(let p of (platforms||[])) if(collideRect(this,p)){
      if(this.vy>0){ this.y = p.y - this.h; this.vy=0; this.onGround=true }
      else if(this.vy<0){ this.y = p.y + p.h; this.vy=0 }
    }
    // collide with walls (vertical)
    for(let w of (walls||[])) if(collideRect(this,w)){
      if(this.vy>0){ this.y = w.y - this.h; this.vy=0; this.onGround=true }
      else if(this.vy<0){ this.y = w.y + w.h; this.vy=0 }
    }

    // landing detection
    if(!prevOnGround && this.onGround){
      // reset jump count on landing
      this.jumpCount = 0;
      // quickly squash horizontally on landing then return
      this.targetScaleX = 1.6; this.targetScaleY = 0.55; 
      setTimeout(()=>{ this.targetScaleX = 1; this.targetScaleY = 1 }, 140);
      playLand();
    }

    // smoothly interpolate visual scales back to target
    const lerp = (a,b,t)=> a + (b-a)*t;
    this.scaleX = lerp(this.scaleX, this.targetScaleX, 0.18);
    this.scaleY = lerp(this.scaleY, this.targetScaleY, 0.18);

    // gently return to normal if target is 1
    if(Math.abs(this.scaleX-1) < 0.01) this.scaleX = 1;
    if(Math.abs(this.scaleY-1) < 0.01) this.scaleY = 1;

    if(this.dashCD>0) this.dashCD--;
  }
  draw(camX){ 
    // draw scaled rectangle so its BOTTOM stays aligned with collision box
    const drawW = this.w * this.scaleX; const drawH = this.h * this.scaleY;
    const dx = this.x - camX + (this.w - drawW)/2; // center horizontally
    const dy = this.y + this.h - drawH; // align bottom to collision bottom
    ctx.fillStyle='rgba(227, 122, 42, 1)'; ctx.fillRect(dx, dy, drawW, drawH);
  }
}

function collideRect(a,b){ return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h) }

// (Pushable boxes removed — simplified gameplay)

// stage system
let currentStage = 0;
let stages = [
  // Stage 1: simple intro
  {
    start: { x: 100, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(200,H-150,200,20), new Rect(520,H-250,200,20), new Rect(720,H-380,140,20) ],
    finish: new Rect(860, H-420, 24, 24)
  },
  // Stage 2: spaced platforms
  {
    start: { x: 80, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(120,H-160,120,20), new Rect(320,H-200,120,20), new Rect(520,H-240,120,20), new Rect(720,H-200,120,20) ],
    finish: new Rect(820, H-260, 24, 24)
  },
  // Stage 3: ascending steps
  {
    start: { x: 60, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(160,H-200,100,20), new Rect(280,H-260,100,20), new Rect(420,H-200,100,20), new Rect(560,H-260,100,20), new Rect(700,H-320,120,20) ],
    finish: new Rect(860, H-420, 24, 24)
  },
  // Stage 4: small gaps and a high platform
  {
    start: { x: 100, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(180,H-160,140,20), new Rect(360,H-160,120,20), new Rect(540,H-280,180,20), new Rect(780,H-220,100,20) ],
    redBlocks: [ { x: 460, y: H-200, w: 120, h: 40 } ],
    finish: new Rect(840, H-240, 24, 24)
  },
  // Stage 5: long dash section
  {
    start: { x: 40, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(220,H-220,400,20), new Rect(680,H-320,160,20) ],
    redBlocks: [ { x: 300, y: H-180, w: 80, h: 40 }, { x: 420, y: H-180, w: 80, h: 40 } ],
    finish: new Rect(840, H-340, 24, 24)
  },
  // Stage 6: tricky timing
  {
    start: { x: 80, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(140,H-180,100,20), new Rect(320,H-220,80,20), new Rect(420,H-260,80,20), new Rect(540,H-200,140,20), new Rect(720,H-300,120,20) ],
    finish: new Rect(860, H-420, 24, 24)
  },
  // Stage 7: low ceilings
  {
    start: { x: 60, y: H-220 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(120,H-260,160,20), new Rect(340,H-300,160,20), new Rect(580,H-260,160,20) ],
    finish: new Rect(820, H-300, 24, 24)
  },
  // Stage 8: mixed heights
  {
    start: { x: 100, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(200,H-180,120,20), new Rect(360,H-260,120,20), new Rect(520,H-220,120,20), new Rect(680,H-280,120,20), new Rect(820,H-200,80,20) ],
    finish: new Rect(880, H-220, 24, 24)
  },
  // Stage 9: narrow platforms
  {
    start: { x: 80, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(160,H-200,60,20), new Rect(260,H-240,60,20), new Rect(360,H-200,60,20), new Rect(460,H-240,60,20), new Rect(560,H-200,60,20), new Rect(720,H-280,160,20) ],
    finish: new Rect(860, H-320, 24, 24)
  },
  // Stage 10: final challenge
  {
    start: { x: 60, y: H-220 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(140,H-200,100,20), new Rect(300,H-260,120,20), new Rect(460,H-220,100,20), new Rect(600,H-300,140,20), new Rect(760,H-240,120,20), new Rect(860,H-320,80,20) ],
    redBlocks: [ { x: 520, y: H-260, w: 80, h: 40 } ],
    finish: new Rect(880, H-360, 24, 24)
  },
  // Stage 11: walls introduction
  {
    start: { x: 80, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(180,H-200,100,20), new Rect(380,H-260,100,20), new Rect(580,H-200,100,20), new Rect(780,H-300,100,20) ],
    walls: [ new Rect(320,H-260,20,80) ],
    finish: new Rect(860, H-340, 24, 24)
  },
  // Stage 12: multiple walls
  {
    start: { x: 60, y: H-220 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(140,H-220,100,20), new Rect(320,H-280,100,20), new Rect(500,H-220,100,20), new Rect(680,H-300,100,20) ],
    walls: [ new Rect(260,H-220,20,100), new Rect(420,H-280,20,120), new Rect(620,H-220,20,100) ],
    finish: new Rect(820, H-340, 24, 24)
  },
  // Stage 13: wall challenge
  {
    start: { x: 100, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(200,H-200,100,20), new Rect(400,H-240,100,20), new Rect(600,H-200,100,20), new Rect(800,H-300,80,20) ],
    walls: [ new Rect(340,H-200,20,120), new Rect(540,H-240,20,140), new Rect(740,H-200,20,140) ],
    redBlocks: [ { x: 460, y: H-240, w: 80, h: 40 } ],
    finish: new Rect(860, H-340, 24, 24)
  },
  // Stage 14: narrow passage
  {
    start: { x: 80, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(160,H-200,100,20), new Rect(360,H-260,100,20), new Rect(560,H-200,100,20), new Rect(760,H-300,100,20) ],
    walls: [ new Rect(300,H-260,30,120), new Rect(490,H-260,30,120), new Rect(700,H-200,20,140) ],
    finish: new Rect(860, H-360, 24, 24)
  },
  // Stage 15: wall maze
  {
    start: { x: 100, y: H-200 },
    platforms: [ new Rect(0,H-40,W,40), new Rect(180,H-200,100,20), new Rect(340,H-240,100,20), new Rect(520,H-200,100,20), new Rect(700,H-280,100,20) ],
    walls: [ new Rect(280,H-200,20,100), new Rect(420,H-240,20,120), new Rect(600,H-200,20,120), new Rect(780,H-280,20,140) ],
    redBlocks: [ { x: 300, y: H-260, w: 80, h: 40 }, { x: 580, y: H-240, w: 80, h: 40 } ],
    finish: new Rect(840, H-340, 24, 24)
  }
];

// Procedurally add more stages to reach 30 total if needed
for(let i = stages.length; i < 30; ++i){
  const baseY = H - 40;
  const p = [ new Rect(0, baseY, W, 40) ];

  // small seeded PRNG for per-stage uniqueness
  let seed = i * 9301 + 49297;
  const rnd = ()=>{ seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed / 4294967296); };

  const redBlocksList = [];
  const platformCount = 3 + Math.floor(rnd() * 5); // 3..7 platforms

  for(let k=0;k<platformCount;k++){
    const x = 80 + Math.floor(rnd()*720) + k*10;
    const w = 60 + Math.floor(rnd()*120);
    const y = baseY - 60 - Math.floor(rnd()*200);
    p.push(new Rect(Math.min(820, x), Math.max(80, y), Math.min(200, w), 20));
  }

  // ensure variety: add one high platform sometimes
  if(rnd() > 0.6) p.push(new Rect(200 + Math.floor(rnd()*480), baseY - 260 - Math.floor(rnd()*80), 140, 20));

  // red block(s) for stage >= 10
  if(i >= 9){
    const rx = 150 + Math.floor(rnd()*620);
    const ry = baseY - 60 - Math.floor(rnd()*220);
    redBlocksList.push({ x: rx, y: Math.max(90, ry), w: 64 + Math.floor(rnd()*80), h: 32 + Math.floor(rnd()*16) });
    if(rnd() > 0.7) redBlocksList.push({ x: 100 + Math.floor(rnd()*700), y: baseY - 40 - Math.floor(rnd()*140), w: 48 + Math.floor(rnd()*64), h: 28 });
  }

  // walls for stage >= 10 (stage index 9+)
  const wallsList = [];
  if(i >= 9){
    const wallCount = 2 + Math.floor(rnd() * 3); // 2-4 walls
    for(let w = 0; w < wallCount; w++){
      const wx = 100 + Math.floor(rnd() * 700);
      const wy = baseY - 100 - Math.floor(rnd() * 200);
      const wh = 80 + Math.floor(rnd() * 140);
      wallsList.push({ x: wx, y: Math.max(80, wy), w: 20, h: Math.min(wy + wh, baseY) - Math.max(80, wy) });
    }
  }

  // final placement
  stages.push({ start: { x: 60, y: H-200 }, platforms: p, redBlocks: redBlocksList, walls: wallsList, finish: new Rect(860, baseY - 80 - Math.floor(rnd()*40), 24, 24) });
}

let platforms = [];
let finishRect = null;
let redBlocks = [];
let walls = [];
const player = new Player(0,0);

function showWin(){
  const menu = document.getElementById('menu');
  menu.style.display = 'flex';
  menu.querySelector('.subtitle').textContent =
    '축하합니다! 모든 스테이지 클리어!';
}

function loadStage(i){
  timerStopped = false;
  stageStartTime = performance.now();
  document.getElementById('timer').classList.remove('clear');
  currentStage = i;
  const s = stages[i];
  platforms = s.platforms.map(p => new Rect(p.x,p.y,p.w,p.h));
  finishRect = new Rect(s.finish.x, s.finish.y, s.finish.w, s.finish.h);
  redBlocks = (s.redBlocks || []).map(r => new Rect(r.x, r.y, r.w, r.h));
  walls = (s.walls || []).map(w => new Rect(w.x, w.y, w.w, w.h));
  resetStage();
}

function resetStage(){
  const s = stages[currentStage];
  player.x = s.start.x; player.y = s.start.y; player.vx = 0; player.vy = 0; player.scaleX = 1; player.scaleY = 1; player.dashCD = 0; player.onGround = false;
  player.jumpCount = 0; player._jumpHeld = false;
  // clear red blocks (recreated from stage data in loadStage)
}

function nextStage(){
  if (currentStage === 29) {
    timerStopped = true;
    document.getElementById('timer').classList.add('clear');
    showWin();
    return;
  }

  loadStage(currentStage + 1);
}

// --- simple WebAudio synth for jump/dash/land sounds ---
const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, duration=0.12, type='sine', volume=0.12, decay=0.02){
  try{ AudioCtx.resume(); }catch(e){}
  const o = AudioCtx.createOscillator();
  const g = AudioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = 0;
  o.connect(g); g.connect(AudioCtx.destination);
  const now = AudioCtx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(volume, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration + decay);
  o.start(now); o.stop(now + duration + decay + 0.02);
}

function playJump(){
  if(!soundEnabled) return;
  playTone(520, 0.12, 'triangle', 0.12, 0.03);
}
function playDash(){
  if(!soundEnabled) return;
  playTone(880, 0.08, 'square', 0.14, 0.01);
}
function playLand(){
  if(!soundEnabled) return;
  playTone(220, 0.14, 'sine', 0.12, 0.02);
}

let currentTimeMs = 0;

function loop(){

  // ===== TIMER =====
  if (window.gameState === 'playing' && !timerStopped) {
  currentTimeMs = performance.now() - stageStartTime;
  document.getElementById('timer').textContent = formatTime(currentTimeMs);
  }

  // ===== GAME LOGIC =====
  if (window.gameState === 'playing') {
    player.handle();
    player.update(platforms);
  }

  if (player.y > H + 120) resetStage();

  for (let r of (redBlocks || [])) {
    if (collideRect(player, r)) resetStage();
  }

  if (finishRect && collideRect(player, finishRect)) {
    nextStage();
  }

  // ===== RENDER =====
  const camX = Math.max(0, player.x + player.w / 2 - W / 2);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1c1c2a';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#50c878';
  for (let p of platforms)
    ctx.fillRect(p.x - camX, p.y, p.w, p.h);

  if (walls.length) {
    ctx.fillStyle = '#8b6f47';
    for (let w of walls)
      ctx.fillRect(w.x - camX, w.y, w.w, w.h);
  }

  if (finishRect) {
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(
      finishRect.x - camX,
      finishRect.y,
      finishRect.w,
      finishRect.h
    );
  }

  if (redBlocks.length) {
    ctx.fillStyle = '#d94b4b';
    for (let r of redBlocks)
      ctx.fillRect(r.x - camX, r.y, r.w, r.h);
  }

  player.draw(camX);

  document.getElementById('info').textContent =
    `Stage: ${currentStage + 1}/${stages.length}`;

  requestAnimationFrame(loop);
}

loop();

// --- Menu and controls wiring ---
window.gameState = 'menu';
document.getElementById('startBtn').addEventListener('click', ()=>{
  if (isMobile()) {
    const mc = document.getElementById('mobileControls'); if (mc) mc.style.display = 'flex';
    const mn2 = document.getElementById('mobileNotice'); if (mn2) mn2.style.display = 'none';
  }

  const sel = Number(document.getElementById('stageSelect').value);

  document.getElementById('menu').style.display = 'none';
  window.gameState = 'playing';

  loadStage(sel);

  menuBtn.style.display = 'block';
  menuBtn.textContent = '☰';
});

// start hidden initial stage
loadStage(0);
