// Alimentador de alta pressão (bomba de cavacos) de uma linha de fibras de celulose.
// Modelo didático: UMA entrada (ângulo do rotor) comanda geometria, painéis, gráfico e fluxos.
import * as THREE from 'three';

// ---------------------------------------------------------------- dados (ilustrativos, em metros / bar)
const P = {
  rotorR: 0.7, // raio do rotor
  rotorL: 2.0, // comprimento do rotor
  boreR: 0.21, // raio do furo (bolso)
  boreL: 1.4, // comprimento do furo passante
  rows: [-0.5, 0.5], // posição axial das duas fileiras
  pLow: 1, // bar, lado calha / retorno
  pHigh: 12, // bar, lado digestor
  rpm: 6,
  fillWin: 15, // meia-janela de enchimento (graus)
};
// 4 furos passantes = 8 bocas. Fileira A em 0° e 90°, fileira B defasada 45°.
const BORES = [
  {name: 'A1', row: 0, a0: 0},
  {name: 'A2', row: 0, a0: 90},
  {name: 'B1', row: 1, a0: 45},
  {name: 'B2', row: 1, a0: 135},
];
const VOL = Math.PI * P.boreR ** 2 * P.boreL; // m³ por bolso
const FILLS_PER_REV = BORES.length * 2; // cada furo enche duas vezes por volta

const smooth = (x) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- modelo (funções puras do ângulo)
/** Estado do furo b com o rotor em theta (graus, sentido horário visto da ponta +X). */
function boreState(b, theta) {
  const alpha = theta + b.a0;
  const k = Math.floor((alpha + P.fillWin) / 180);
  const d = alpha - 180 * k; // -15 .. 165: 0 = vertical (enche), 90 = horizontal (descarrega)
  let F;
  if (d < P.fillWin) F = (d + P.fillWin) / (2 * P.fillWin);
  else if (d < 75) F = 1;
  else if (d < 105) F = 1 - (d - 75) / 30;
  else F = 0;
  const fillAct = d >= -P.fillWin && d < P.fillWin ? Math.sin((Math.PI * (d + P.fillWin)) / (2 * P.fillWin)) : 0;
  const dischAct = d >= 75 && d < 105 ? Math.sin((Math.PI * (d - 75)) / 30) : 0;
  let state = 'VAZIO';
  if (fillAct > 0) state = 'ENCHENDO';
  else if (dischAct > 0) state = 'DESCARREGANDO';
  else if (d >= P.fillWin && d < 75) state = 'PRESSURIZANDO';
  else if (d >= 105 && d < 165) state = 'DESPRESSURIZANDO';
  return {alpha, k, d, F, fillAct, dischAct, state, p: pressure(d)};
}
function pressure(d) {
  if (d < 0) return P.pLow;
  return P.pLow + (P.pHigh - P.pLow) * smooth((d - 45) / 25) * (1 - smooth((d - 115) / 25));
}

// ---------------------------------------------------------------- cena
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece6d8');
scene.fog = new THREE.Fog('#ece6d8', 14, 30);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight('#ffffff', '#b9ad96', 1.15));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(4, 7, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight('#cfe0ff', 0.8);
rim.position.set(-5, 2, -4);
scene.add(rim);

const C = {ink: '#2a2521', lp: '#2f7fb8', hp: '#e3562a', chip: '#c9985a', steel: '#7f8c96'};

const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({color: '#e2dac9', roughness: 1}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.1;
scene.add(floor);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // corta o lado +Z
const clipOn = [clipPlane];
const housingMat = new THREE.MeshStandardMaterial({color: C.steel, roughness: 0.55, metalness: 0.4, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: []});
const ductMat = (color) => new THREE.MeshStandardMaterial({color, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: []});
const lineMat = new THREE.LineBasicMaterial({color: C.ink, transparent: true, opacity: 0.55, clippingPlanes: []});
const clipMats = [housingMat, lineMat];

const stat = new THREE.Group(); // tudo que não gira
scene.add(stat);
const rotX = (m) => m.rotateZ(Math.PI / 2); // cilindro com eixo em X

// carcaça
const housing = new THREE.Mesh(rotX(new THREE.CylinderGeometry(P.rotorR + 0.05, P.rotorR + 0.05, P.rotorL + 0.1, 64, 1, true)), housingMat);
stat.add(housing);
for (const s of [-1, 1]) {
  const flange = new THREE.Mesh(rotX(new THREE.TorusGeometry(P.rotorR + 0.05, 0.04, 8, 64)).rotateY(0), new THREE.MeshStandardMaterial({color: '#5d6a74', roughness: 0.5, metalness: 0.6}));
  flange.rotation.y = Math.PI / 2;
  flange.position.x = s * (P.rotorL / 2 + 0.05);
  stat.add(flange);
}
// portas: caixas retangulares (largura axial 1,9)
const ducts = [];
function duct(name, color, center, size) {
  const mat = ductMat(color);
  clipMats.push(mat);
  const g = new THREE.BoxGeometry(...size);
  const m = new THREE.Mesh(g, mat);
  m.position.set(...center);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat);
  m.add(edges);
  stat.add(m);
  ducts.push(m);
  return m;
}
const Rh = P.rotorR + 0.05;
duct('calha', C.lp, [0, Rh + 0.8, 0], [1.9, 1.6, 0.6]);
duct('retorno', C.lp, [0, -(Rh + 0.6), 0], [1.9, 1.2, 0.6]);
duct('saida', C.hp, [0, 0, -(Rh + 0.8)], [1.9, 0.6, 1.6]);
duct('entrada', C.hp, [0, 0, Rh + 0.8], [1.9, 0.6, 1.6]);
// base
const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.6), new THREE.MeshStandardMaterial({color: '#6d6a64', roughness: 0.8}));
base.position.y = -2.05;
stat.add(base);
// eixo e acionamento (motor + redutor, só silhueta)
const shaft = new THREE.Mesh(rotX(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 24)), new THREE.MeshStandardMaterial({color: '#4c555c', roughness: 0.4, metalness: 0.8}));
stat.add(shaft);
const drive = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), new THREE.MeshStandardMaterial({color: C.ink, roughness: 0.6}));
drive.position.set(-2.1, 0, 0);
stat.add(drive);

// rotor (gira)
const rotor = new THREE.Group();
scene.add(rotor);
const rotorMat = new THREE.MeshPhysicalMaterial({color: '#c9d1d6', roughness: 0.35, metalness: 0.3, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false});
rotor.add(new THREE.Mesh(rotX(new THREE.CylinderGeometry(P.rotorR, P.rotorR, P.rotorL, 64)), rotorMat));
// marca para ver a rotação
const mark = new THREE.Mesh(new THREE.BoxGeometry(P.rotorL + 0.02, 0.05, 0.08), new THREE.MeshStandardMaterial({color: C.ink}));
mark.position.y = P.rotorR;
rotor.add(mark);

const chipMat = new THREE.MeshStandardMaterial({color: C.chip, roughness: 0.9});
const bores = BORES.map((b) => {
  const g = new THREE.Group();
  g.rotation.x = (-b.a0 * Math.PI) / 180;
  g.position.x = P.rows[b.row];
  const tubeMat = new THREE.MeshStandardMaterial({color: '#4a5964', roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, emissive: '#000000'});
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(P.boreR, P.boreR, P.boreL, 40, 1, true), tubeMat);
  g.add(tube);
  const chips = new THREE.Mesh(new THREE.CylinderGeometry(P.boreR * 0.92, P.boreR * 0.92, 1, 24), chipMat);
  g.add(chips);
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(P.boreR, 0.018, 8, 40), new THREE.MeshStandardMaterial({color: C.ink}));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = (s * P.boreL) / 2;
    g.add(ring);
  }
  rotor.add(g);
  return {b, g, tubeMat, chips};
});

// partículas de fluxo
const rnd = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();
function stream(color, from, to, n, axisPerp) {
  const pos = new Float32Array(n * 3);
  const seed = Array.from({length: n}, (_, i) => ({s: rnd(), x: P.rows[i % 2] + (rnd() - 0.5) * 0.3, o: (rnd() - 0.5) * 0.2, v: 0.7 + rnd() * 0.6}));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({color, size: 0.085, transparent: true, opacity: 0, depthWrite: false});
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let tf = 0;
  return {
    update(act, dt) {
      tf += dt * act;
      mat.opacity = clamp(act * 1.4, 0, 0.95);
      for (let i = 0; i < n; i++) {
        const q = seed[i];
        const f = (q.s + tf * q.v * 0.9) % 1;
        pos[i * 3] = q.x;
        pos[i * 3 + 1] = from[1] + (to[1] - from[1]) * f + (axisPerp === 'y' ? 0 : q.o);
        pos[i * 3 + 2] = from[2] + (to[2] - from[2]) * f + (axisPerp === 'y' ? q.o : 0);
        if (axisPerp === 'z') pos[i * 3 + 1] = q.o;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
const sChute = stream(C.chip, [0, 2.3, 0], [0, 0.85, 0], 70, 'y');
const sLP = stream(C.lp, [0, -0.85, 0], [0, -2.0, 0], 50, 'y');
const sHPin = stream(C.hp, [0, 0, 2.4], [0, 0, 0.85], 50, 'z');
const sOut = stream(C.chip, [0, 0, -0.85], [0, 0, -2.6], 70, 'z');

// ---------------------------------------------------------------- rótulos 3D
const labels = [
  {id: 'calha', text: 'CALHA DE CAVACOS', sub: 'baixa pressão', p: [0, 2.35, 0], c: C.lp},
  {id: 'ret', text: 'RETORNO DE LICOR', sub: 'baixa pressão', p: [0, -1.45, 0], c: C.lp},
  {id: 'in', text: 'LICOR DE ALTA PRESSÃO', sub: 'da bomba de circulação', p: [0, 0.35, 2.4], c: C.hp},
  {id: 'out', text: 'PARA O DIGESTOR', sub: 'cavacos + licor', p: [0, 0.35, -2.5], c: C.hp},
];

// ---------------------------------------------------------------- interface
const css = document.createElement('style');
css.textContent = `
html,body{background:#ece6d8;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#2a2521}
#app{position:fixed;inset:0;color:#2a2521}
#gl{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.ui{position:absolute;pointer-events:none}
.card{color:#2a2521;background:rgba(252,249,244,.93);border:1px solid #ddd2bf;border-radius:8px;padding:12px 14px;pointer-events:auto}
.h{font:700 10px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:#8c7f6d;margin-bottom:8px;text-transform:uppercase}
#title{left:16px;top:14px}
#title b{font-size:20px;letter-spacing:-.3px}
#title div{font:600 11px 'JetBrains Mono',monospace;color:#8c7f6d;margin-top:2px}
#left{left:16px;top:84px;width:300px;display:flex;flex-direction:column;gap:10px}
#right{right:16px;top:14px;width:300px;display:flex;flex-direction:column;gap:10px}
#bottom{left:50%;bottom:14px;transform:translateX(-50%);width:min(860px,calc(100vw - 32px));display:flex;flex-direction:column;gap:8px;align-items:stretch}
#cap{font-size:15px;line-height:1.4;min-height:62px;display:flex;gap:10px;align-items:flex-start}
#cap i{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:${C.hp}}
#cap.on i{animation:bl 1.2s steps(2) infinite}
@keyframes bl{50%{opacity:.15}}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{font:700 10px 'JetBrains Mono',monospace;letter-spacing:1px;border:1px solid #ddd2bf;background:#fff;color:#2a2521;border-radius:5px;padding:8px 10px;cursor:pointer;text-transform:uppercase}
button:hover{background:#f6efe2}
button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.kpi{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kpi div{font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d;text-transform:uppercase;letter-spacing:.8px}
.kpi b{display:block;font:700 22px Inter,sans-serif;color:#2a2521;letter-spacing:-.5px;text-transform:none}
.kpi b small{font:600 11px 'JetBrains Mono',monospace;color:#8c7f6d}
table{width:100%;border-collapse:collapse;font:600 10px 'JetBrains Mono',monospace}
td{padding:4px 2px;border-top:1px solid #eadfcd;white-space:nowrap}
.bar{display:inline-block;height:6px;background:${C.chip};border-radius:3px;vertical-align:middle}
.st{display:inline-block;padding:2px 5px;border-radius:3px;color:#fff;font-size:9px}
input[type=range]{width:100%;accent-color:${C.ink}}
.lab{position:absolute;transform:translate(-50%,-100%);font:700 10px 'JetBrains Mono',monospace;letter-spacing:.8px;text-align:center;white-space:nowrap;pointer-events:none;text-shadow:0 0 4px #ece6d8,0 0 4px #ece6d8}
.lab small{display:block;font-weight:600;color:#8c7f6d;letter-spacing:.4px}
#note{font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d}
@media(max-width:900px){#right{display:none}#left{width:min(300px,calc(100vw - 32px));top:70px}#cap{font-size:13px;min-height:54px}.lab{font-size:8px}}
@media(max-width:600px){#left{display:none}}
`;
document.head.appendChild(css);
const el = (html, cls = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  app.appendChild(d);
  return d;
};
el(`<b>Bomba de cavacos</b><div>ALIMENTADOR DE ALTA PRESSÃO · POLPAÇÃO</div>`, 'ui card').id = 'title';
const left = el(
  `<div class="card"><div class="h">Produção</div>
     <div class="kpi"><div>Rotação<b id="k-rpm">6<small> rpm</small></b></div><div>Cavacos<b id="k-q">–<small> m³/h</small></b></div>
     <div>Ângulo<b id="k-ang">0<small> °</small></b></div><div>Enchimentos<b id="k-fills">8<small> /volta</small></b></div></div>
     <div style="margin-top:10px" class="h">Velocidade do rotor</div><input id="rpm" type="range" min="0" max="14" step="0.5" value="6"></div>
   <div class="card"><div class="h">Bolsos do rotor (furos passantes)</div><table id="tbl"></table></div>`,
  'ui',
);
left.id = 'left';
const right = el(
  `<div class="card"><div class="h">Pressão no bolso A1 × ângulo</div><canvas id="chart" width="276" height="130"></canvas>
     <div id="note" style="margin-top:6px">Linha cheia: pressão. Ponto: posição atual.</div></div>
   <div class="card"><div class="h">Circuito</div>
     <table><tr><td style="color:${C.lp}">● Calha</td><td>cavacos entram a ~${P.pLow} bar</td></tr>
     <tr><td style="color:${C.lp}">● Retorno</td><td>licor sai pela tela</td></tr>
     <tr><td style="color:${C.hp}">● Entrada AP</td><td>licor da bomba de circulação</td></tr>
     <tr><td style="color:${C.hp}">● Saída AP</td><td>~${P.pHigh} bar para o digestor</td></tr></table></div>`,
  'ui',
);
right.id = 'right';
const bottom = el(
  `<div class="card"><div id="cap"><i></i><span id="cap-t"></span></div></div>
   <div class="card"><div class="row" id="ctl"></div>
   <div id="note" style="margin-top:6px">Modelo didático: dimensões, pressões e rotação são ilustrativas. Confira com o manual do seu equipamento. Arraste para girar · roda para zoom · espaço pausa.</div></div>`,
  'ui',
);
bottom.id = 'bottom';
const ctl = document.getElementById('ctl');
const btn = {};
const mk = (id, label) => {
  const b = document.createElement('button');
  b.textContent = label;
  btn[id] = b;
  ctl.appendChild(b);
  return b;
};
mk('tour', '● Tour automático');
mk('play', '❚❚ Pausar');
for (const [id, l] of [['hero', '1 Isométrica'], ['front', '2 Frontal'], ['side', '3 Lateral'], ['top', '4 Superior']]) mk(id, l);
mk('section', 'Corte');
mk('isolate', 'Isolar rotor');
const labEls = labels.map((l) => {
  const d = el(`<span style="color:${l.c}">${l.text}</span><small>${l.sub}</small>`, 'lab');
  d.style.color = l.c;
  return d;
});

// ---------------------------------------------------------------- câmera e controles
const VIEWS = {
  hero: {az: 48, el: 24, d: 9.5, ty: 0.1},
  front: {az: 90, el: 0, d: 9.5, ty: 0.15},
  side: {az: 0, el: 6, d: 10, ty: 0.1},
  top: {az: 90, el: 84, d: 10, ty: 0},
};
const cam = {...VIEWS.hero};
let view = 'hero';
const off = {az: 0, el: 0, k: 1};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const toggles = {section: false, isolate: false};
let theta = 0;
let paused = false;
let rpm = P.rpm;
let T = 0;
let lastInput = 0;

// roteiro do tour (segundos, ciclo)
const TOUR = [
  {t: 0, view: 'hero', rpm: 6, section: false, isolate: false, text: 'O alimentador de alta pressão é uma válvula rotativa: leva os cavacos da pressão atmosférica até a pressão do digestor, sem deixar a pressão voltar.'},
  {t: 9, view: 'front', rpm: 4, section: false, isolate: false, text: 'Visto de frente, o rotor é um relógio com 4 furos passantes. Na posição vertical, o furo liga a calha (cima) ao retorno de licor (baixo).'},
  {t: 18, view: 'front', rpm: 3, section: false, isolate: false, text: 'Enchimento: os cavacos caem da calha e se acumulam no furo. O licor escapa para baixo pelo retorno e fica na baixa pressão.'},
  {t: 27, view: 'front', rpm: 3, section: false, isolate: false, text: 'Pressurização e transferência: com o furo na horizontal, o licor de alta pressão entra pela esquerda e empurra os cavacos pela saída, até o digestor.'},
  {t: 37, view: 'side', rpm: 6, section: true, isolate: false, text: 'No corte lateral vemos as duas fileiras: a fileira B é defasada 45°, então sempre há um furo se enchendo e outro descarregando.'},
  {t: 47, view: 'hero', rpm: 6, section: false, isolate: true, text: 'Só o rotor: cada furo enche duas vezes por volta. Com a rotação e o volume do bolso, calculamos o fluxo de cavacos mostrado no painel.'},
  {t: 56, view: 'hero', rpm: 6, section: false, isolate: false, text: 'Agora é com você: gire a câmera, mude a rotação, abra o corte. O tour volta sozinho após 25 s sem mexer.'},
];
const TOUR_LEN = 64;
let tourOn = true;
let tourT0 = 0;
let tourStep = -1;

const setView = (v) => {
  view = v;
  Object.assign(off, {az: 0, el: 0, k: 1});
};
const setToggle = (k, on) => {
  toggles[k] = on;
  btn[k].classList.toggle('on', on);
};
const takeOver = () => {
  lastInput = T;
  if (!tourOn) return;
  tourOn = false;
  btn.tour.classList.remove('on');
  btn.tour.textContent = '▶ Retomar tour';
  document.getElementById('cap').classList.remove('on');
};
const startTour = () => {
  tourOn = true;
  tourT0 = T;
  tourStep = -1;
  paused = false;
  btn.tour.classList.add('on');
  btn.tour.textContent = '● Tour automático';
  document.getElementById('cap').classList.add('on');
};
btn.tour.addEventListener('click', () => (tourOn ? takeOver() : startTour()));
btn.play.addEventListener('click', () => {
  takeOver();
  paused = !paused;
  btn.play.textContent = paused ? '▶ Girar' : '❚❚ Pausar';
});
for (const v of Object.keys(VIEWS))
  btn[v].addEventListener('click', () => {
    takeOver();
    setView(v);
  });
btn.section.addEventListener('click', () => {
  takeOver();
  setToggle('section', !toggles.section);
});
btn.isolate.addEventListener('click', () => {
  takeOver();
  setToggle('isolate', !toggles.isolate);
});
const rpmEl = document.getElementById('rpm');
rpmEl.addEventListener('input', () => {
  takeOver();
  rpm = Number(rpmEl.value);
});
addEventListener('keydown', (e) => {
  const m = {1: 'hero', 2: 'front', 3: 'side', 4: 'top'}[e.key];
  if (m) btn[m].click();
  else if (e.key === ' ') btn.play.click();
  else if (e.key === 's') btn.section.click();
  else if (e.key === 'i') btn.isolate.click();
  else return;
  e.preventDefault();
});
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  takeOver();
  drag = {x: e.clientX, y: e.clientY};
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  off.az -= (e.clientX - drag.x) * 0.35;
  off.el = clamp(off.el + (e.clientY - drag.y) * 0.25, -30, 89);
  drag = {x: e.clientX, y: e.clientY};
  lastInput = T;
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('drag');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    takeOver();
    off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2.2);
  },
  {passive: false},
);

// ---------------------------------------------------------------- tabela e gráfico
const COLORS = {ENCHENDO: C.lp, PRESSURIZANDO: '#c98a1c', DESCARREGANDO: C.hp, DESPRESSURIZANDO: '#8a6fb0', VAZIO: '#9b9387'};
const tbl = document.getElementById('tbl');
tbl.innerHTML = BORES.map((b) => `<tr id="r-${b.name}"><td>${b.name}</td><td class="s"></td><td class="f"></td><td class="p" style="text-align:right"></td></tr>`).join('');
const chart = document.getElementById('chart');
const cx = chart.getContext('2d');
function drawChart(d) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (chart.width !== 276 * dpr) {
    chart.width = 276 * dpr;
    chart.height = 130 * dpr;
    chart.style.width = '276px';
    chart.style.height = '130px';
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, 276, 130);
  const X = (v) => 8 + ((v + P.fillWin) / 180) * 260;
  const Y = (p) => 118 - (p / 14) * 104;
  cx.strokeStyle = '#eadfcd';
  cx.fillStyle = '#8c7f6d';
  cx.font = "600 9px 'JetBrains Mono',monospace";
  cx.lineWidth = 1;
  for (const p of [0, P.pLow, P.pHigh]) {
    cx.beginPath();
    cx.moveTo(8, Y(p));
    cx.lineTo(268, Y(p));
    cx.stroke();
    cx.fillText(`${p}`, 0, Y(p) - 2);
  }
  // janelas de enchimento e descarga
  cx.fillStyle = 'rgba(47,127,184,.14)';
  cx.fillRect(X(-P.fillWin), 4, X(P.fillWin) - X(-P.fillWin), 114);
  cx.fillStyle = 'rgba(227,86,42,.14)';
  cx.fillRect(X(75), 4, X(105) - X(75), 114);
  cx.fillStyle = '#8c7f6d';
  cx.fillText('ENCHE', X(-P.fillWin) + 2, 14);
  cx.fillText('DESCARREGA', X(75) - 4, 14);
  cx.strokeStyle = C.ink;
  cx.lineWidth = 1.8;
  cx.beginPath();
  for (let a = -P.fillWin; a <= 165; a += 2) {
    const x = X(a);
    const y = Y(pressure(a));
    if (a === -P.fillWin) cx.moveTo(x, y);
    else cx.lineTo(x, y);
  }
  cx.stroke();
  cx.fillStyle = C.hp;
  cx.beginPath();
  cx.arc(X(d), Y(pressure(d)), 4.5, 0, Math.PI * 2);
  cx.fill();
}

// ---------------------------------------------------------------- laço
const target = new THREE.Vector3();
const v3 = new THREE.Vector3();
const resize = () => {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();
btn.tour.classList.add('on');
document.getElementById('cap').classList.add('on');
setToggle('section', false);
setToggle('isolate', false);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  T += dt;

  // tour
  if (tourOn) {
    const c = (T - tourT0) % TOUR_LEN;
    let i = 0;
    for (let j = 0; j < TOUR.length; j++) if (c >= TOUR[j].t) i = j;
    if (i !== tourStep) {
      tourStep = i;
      const s = TOUR[i];
      setView(s.view);
      setToggle('section', s.section);
      setToggle('isolate', s.isolate);
      rpm = s.rpm;
      rpmEl.value = rpm;
      document.getElementById('cap-t').textContent = s.text;
    }
  } else if (T - lastInput > 25) startTour();
  if (!document.getElementById('cap-t').textContent) document.getElementById('cap-t').textContent = TOUR[0].text;

  if (!paused) theta = (theta + rpm * 6 * dt) % 36000;

  // estado dos furos
  const st = BORES.map((b) => boreState(b, theta));
  let fillAct = 0;
  let dischAct = 0;
  st.forEach((s, i) => {
    fillAct += s.fillAct;
    dischAct += s.dischAct;
    const B = bores[i];
    const e = s.k % 2 === 0 ? -1 : 1; // extremidade local que fica embaixo no enchimento
    const len = Math.max(0.001, P.boreL * s.F);
    B.chips.scale.set(1, len, 1);
    B.chips.position.y = e * (P.boreL / 2 - len / 2);
    B.chips.visible = s.F > 0.002;
    const col = s.state === 'ENCHENDO' ? C.lp : s.state === 'DESCARREGANDO' ? C.hp : '#4a5964';
    B.tubeMat.color.set(col);
    B.tubeMat.emissive.set(s.state === 'ENCHENDO' || s.state === 'DESCARREGANDO' ? col : '#000000');
    B.tubeMat.emissiveIntensity = 0.25;
    B.tubeMat.opacity = s.state === 'ENCHENDO' || s.state === 'DESCARREGANDO' ? 0.8 : 0.5;
  });
  rotor.rotation.x = (-theta * Math.PI) / 180;
  sChute.update(clamp(fillAct, 0, 1), paused ? 0 : dt);
  sLP.update(clamp(fillAct, 0, 1), paused ? 0 : dt);
  sHPin.update(clamp(dischAct, 0, 1), paused ? 0 : dt);
  sOut.update(clamp(dischAct, 0, 1), paused ? 0 : dt);

  // corte e isolar
  const clip = toggles.section ? clipOn : [];
  for (const m of clipMats) m.clippingPlanes = clip;
  for (const o of bores) o.tubeMat.clippingPlanes = [];
  housing.visible = !toggles.isolate;
  stat.children.forEach((c) => {
    if (c !== shaft && c !== drive) c.visible = !toggles.isolate || false;
  });
  shaft.visible = true;
  drive.visible = !toggles.isolate;
  rotorMat.opacity = toggles.isolate ? 0.34 : 0.2;

  // câmera
  const tv = VIEWS[view];
  const k = 1 - Math.exp(-dt / (tourOn ? 0.35 : 0.3));
  cam.az += wrap(tv.az + off.az - cam.az) * k;
  cam.el += (clamp(tv.el + off.el, -30, 89) - cam.el) * k;
  cam.d += (tv.d * off.k - cam.d) * k;
  cam.ty += (tv.ty - cam.ty) * k;
  const az = (cam.az * Math.PI) / 180;
  const el = (cam.el * Math.PI) / 180;
  target.set(0, cam.ty, 0);
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(cam.d).add(target);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  renderer.render(scene, camera);

  // rótulos
  labels.forEach((l, i) => {
    v3.set(...l.p).project(camera);
    const d = labEls[i];
    d.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`;
    d.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
    d.style.display = v3.z < 1 && !(toggles.isolate) ? 'block' : 'none';
  });

  // painéis
  const q = FILLS_PER_REV * VOL * rpm * 60; // m³/h de volume de bolso movido
  document.getElementById('k-rpm').innerHTML = `${rpm.toFixed(1)}<small> rpm</small>`;
  document.getElementById('k-q').innerHTML = `${Math.round(q)}<small> m³/h</small>`;
  document.getElementById('k-ang').innerHTML = `${Math.round(theta % 360)}<small> °</small>`;
  st.forEach((s, i) => {
    const r = document.getElementById(`r-${BORES[i].name}`);
    r.children[1].innerHTML = `<span class="st" style="background:${COLORS[s.state]}">${s.state}</span>`;
    r.children[2].innerHTML = `<span class="bar" style="width:${Math.round(s.F * 40)}px"></span>`;
    r.children[3].textContent = `${s.p.toFixed(1)} bar`;
  });
  drawChart(st[0].d);

  if (!window.SIM_SHOWN) window.SIM_SHOWN = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.FEEDER = {get theta() {
  return theta;
}, setTheta: (t) => (theta = t), P, boreState};
