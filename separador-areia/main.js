// Separador de areia (hidrociclone) do circuito de licor do alimentador de alta pressão.
// Modelo didático: vazão, concentração de areia e dimensões comandam geometria, partículas, painéis e gráfico.
import * as THREE from 'three';

// ---------------------------------------------------------------- dados (ilustrativos; SI)
const G = {
  R: 0.25, // raio do corpo cilíndrico
  Hcyl: 0.55, // altura do corpo cilíndrico
  Hcone: 1.2, // altura do cone
  rUnder: 0.045, // raio do bocal de underflow
  rFinder: 0.1, // raio do tubo de vórtice (overflow)
  inW: 0.1, // largura radial da entrada
  inH: 0.2, // altura da entrada
  chamR: 0.22, // raio da câmara de areia
  chamH: 0.85, // altura útil da câmara
  mu: 0.0004, // Pa·s, licor quente
  rhoL: 1050, // kg/m³, licor
  rhoS: 2650, // kg/m³, areia
  bulk: 1600, // kg/m³, areia depositada
  underSplit: 0.08, // fração da vazão que sai pelo underflow
  Heff: 0.6, // altura efetiva de fuga radial
  Q0: 250, // m³/h, vazão de projeto (referência)
};
const A_IN = G.inW * G.inH;
const CH_VOL = Math.PI * G.chamR ** 2 * G.chamH;
const CH_KG = CH_VOL * G.bulk;
const D_MEDIAN = 90e-6; // mediana da areia na alimentação (m)
const D_SIGMA = 0.6; // desvio (ln)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

// ---------------------------------------------------------------- modelo (funções puras de Q e c)
function model(Qh) {
  const Q = Qh / 3600; // m³/s
  const vIn = Q / A_IN;
  const vT = 1.2 * vIn; // velocidade tangencial junto ao tubo de vórtice
  const a = (vT * vT) / G.rFinder; // aceleração centrífuga
  const Qover = Q * (1 - G.underSplit);
  const uR = Qover / (2 * Math.PI * G.rFinder * G.Heff); // arraste radial para dentro
  const d50 = Math.sqrt((18 * G.mu * uR) / ((G.rhoS - G.rhoL) * a)); // m
  const dP = 6 * 0.5 * G.rhoL * vIn * vIn; // Pa, Eu ≈ 6
  return {Q, vIn, a, uR, d50, dP, g: a / 9.81};
}
const eta = (d, d50) => {
  const base = 1 / (1 + Math.pow(d50 / d, 3));
  return G.underSplit + (1 - G.underSplit) * base; // by-pass pela água
};
const pdf = (d) => {
  const x = (Math.log(d) - Math.log(D_MEDIAN)) / D_SIGMA;
  return Math.exp(-0.5 * x * x) / (d * D_SIGMA * Math.sqrt(2 * Math.PI));
};
function globalEff(d50) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < 200; i++) {
    const ld = Math.log(5e-6) + ((Math.log(2e-3) - Math.log(5e-6)) * i) / 199;
    const d = Math.exp(ld);
    const w = pdf(d) * d;
    num += w * eta(d, d50);
    den += w;
  }
  return num / den;
}

// ---------------------------------------------------------------- cena
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece6d8');
scene.fog = new THREE.Fog('#ece6d8', 14, 32);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight('#ffffff', '#b9ad96', 1.15));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(4, 7, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight('#cfe0ff', 0.8);
rim.position.set(-5, 2, -4);
scene.add(rim);

const C = {ink: '#2a2521', liq: '#2f7fb8', sand: '#b8862f', lost: '#d12f2f', steel: '#7f8c96', ok: '#2e9d5c', bad: '#d12f2f'};

const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({color: '#e2dac9', roughness: 1}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.95;
scene.add(floor);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const shellMat = new THREE.MeshStandardMaterial({color: C.steel, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: []});
const lineMat = new THREE.LineBasicMaterial({color: C.ink, transparent: true, opacity: 0.5, clippingPlanes: []});
const clipMats = [shellMat, lineMat];
const body = new THREE.Group();
scene.add(body);

// corpo: lathe do perfil (r, y)
const prof = [
  [G.rUnder, 0],
  [G.R, G.Hcone],
  [G.R, G.Hcone + G.Hcyl],
  [G.rFinder + 0.005, G.Hcone + G.Hcyl],
].map(([r, y]) => new THREE.Vector2(r, y));
const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), shellMat);
body.add(shell);
const topY = G.Hcone + G.Hcyl; // 1.75
// anéis para dar leitura de aço
const ringMat = new THREE.MeshStandardMaterial({color: '#5d6a74', roughness: 0.5, metalness: 0.6});
for (const [r, y] of [[G.R + 0.005, G.Hcone], [G.R + 0.005, topY], [G.rUnder + 0.01, 0]]) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 8, 64), ringMat);
  t.rotation.x = Math.PI / 2;
  t.position.y = y;
  body.add(t);
}
// tubo de vórtice + overflow
const finderMat = new THREE.MeshStandardMaterial({color: '#4a90c2', roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false});
const finder = new THREE.Mesh(new THREE.CylinderGeometry(G.rFinder, G.rFinder, 1.1, 40, 1, true), finderMat);
finder.position.y = 1.35 + 0.55;
body.add(finder);
const overflow = new THREE.Mesh(new THREE.CylinderGeometry(G.rFinder, G.rFinder, 1.7, 40, 1, true), finderMat);
overflow.rotation.z = Math.PI / 2;
overflow.position.set(0.85, 2.4, 0);
body.add(overflow);
const elbow = new THREE.Mesh(new THREE.SphereGeometry(G.rFinder * 1.02, 32, 16), finderMat);
elbow.position.set(0, 2.4, 0);
body.add(elbow);
// entrada tangencial (caixa que chega por +Z em x = R - inW/2)
const inGeo = new THREE.BoxGeometry(G.inW, G.inH, 1.6);
const inlet = new THREE.Mesh(inGeo, finderMat.clone());
inlet.material.color.set('#2f7fb8');
inlet.position.set(G.R - G.inW / 2, 1.55, 0.8);
inlet.add(new THREE.LineSegments(new THREE.EdgesGeometry(inGeo), lineMat));
body.add(inlet);
// underflow, válvulas e câmara
const ufPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 24, 1, true), shellMat);
ufPipe.position.y = -0.25;
body.add(ufPipe);
const chamMat = new THREE.MeshStandardMaterial({color: C.steel, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: []});
clipMats.push(chamMat);
const chamber = new THREE.Mesh(new THREE.CylinderGeometry(G.chamR, G.chamR, G.chamH, 48, 1, true), chamMat);
chamber.position.y = -0.5 - G.chamH / 2;
body.add(chamber);
for (const s of [0, -G.chamH]) {
  const cap = new THREE.Mesh(new THREE.CircleGeometry(G.chamR, 48), chamMat);
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = -0.5 + s;
  body.add(cap);
}
const sandMesh = new THREE.Mesh(new THREE.CylinderGeometry(G.chamR * 0.96, G.chamR * 0.96, 1, 40), new THREE.MeshStandardMaterial({color: C.sand, roughness: 0.95}));
body.add(sandMesh);
const valveMat = (c) => new THREE.MeshStandardMaterial({color: c, roughness: 0.5, metalness: 0.3});
const vUp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), valveMat(C.ok));
vUp.position.set(0, -0.35, 0);
body.add(vUp);
const vDn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), valveMat(C.bad));
vDn.position.set(0, -0.5 - G.chamH - 0.1, 0);
body.add(vDn);
const dischPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 24, 1, true), shellMat);
dischPipe.position.y = -0.5 - G.chamH - 0.3;
body.add(dischPipe);
const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), new THREE.MeshStandardMaterial({color: '#6d6a64', roughness: 0.8}));
base.position.y = -1.9;
body.add(base);
// pernas
for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), ringMat);
  leg.position.set(x * 0.9, -0.95, z * 0.9);
  leg.visible = false; // mantidas fora: o foco é o ciclone
  body.add(leg);
}

// ---------------------------------------------------------------- partículas
const wallR = (y) => (y >= G.Hcone ? G.R : G.rUnder + (G.R - G.rUnder) * (y / G.Hcone));
const TWO_PI = Math.PI * 2;
function pathPos(kind, f, ph, out) {
  // kind 0: caminho da areia (parede e underflow); kind 1: caminho do overflow (núcleo)
  const xin = G.R - G.inW / 2 + ph.dx;
  const yin = 1.55 + ph.dy;
  if (f < 0.12) {
    out[0] = xin;
    out[1] = yin;
    out[2] = 1.6 * (1 - f / 0.12);
    return;
  }
  if (kind === 0) {
    if (f < 0.85) {
      const g = (f - 0.12) / 0.73;
      const y = yin * (1 - g * g * 0.35 - g * 0.65);
      const r = lerp(xin, wallR(Math.max(0, y)) - 0.015, smooth(g * 3));
      const phi = -TWO_PI * 6 * g;
      out[0] = r * Math.cos(phi);
      out[1] = Math.max(0, y);
      out[2] = r * Math.sin(phi);
    } else {
      const h = (f - 0.85) / 0.15;
      out[0] = 0.01 * (1 - h);
      out[1] = -0.45 * h;
      out[2] = 0;
    }
  } else if (f < 0.5) {
    const g = (f - 0.12) / 0.38;
    const r = lerp(xin, 0.07, smooth(g));
    const phi = -TWO_PI * 2.5 * g;
    out[0] = r * Math.cos(phi);
    out[1] = yin - 0.55 * g;
    out[2] = r * Math.sin(phi);
  } else if (f < 0.85) {
    const g = (f - 0.5) / 0.35;
    const phi = -TWO_PI * (2.5 + 2.5 * g);
    const r = 0.05;
    out[0] = r * Math.cos(phi);
    out[1] = yin - 0.55 + (2.4 - (yin - 0.55)) * g;
    out[2] = r * Math.sin(phi);
  } else {
    const h = (f - 0.85) / 0.15;
    out[0] = 1.65 * h;
    out[1] = 2.4;
    out[2] = 0;
  }
}
const rndGen = (() => {
  let s = 11;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();
const NS = 110;
const NL = 100;
const sandP = Array.from({length: NS}, () => {
  // diâmetro lognormal da distribuição da alimentação
  const u1 = rndGen() || 0.5;
  const u2 = rndGen();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-6))) * Math.cos(TWO_PI * u2);
  return {d: D_MEDIAN * Math.exp(D_SIGMA * z), u: rndGen(), t0: rndGen(), cyc: -1, kind: 0, ph: {dx: (rndGen() - 0.5) * 0.04, dy: (rndGen() - 0.5) * 0.12}};
});
const liqP = Array.from({length: NL}, (_, i) => ({t0: rndGen(), cyc: -1, kind: i % 12 === 0 ? 0 : 1, ph: {dx: (rndGen() - 0.5) * 0.04, dy: (rndGen() - 0.5) * 0.12}}));
function makePoints(n, size, colorAttr) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (colorAttr) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({size, sizeAttenuation: true, vertexColors: !!colorAttr, color: colorAttr ? '#ffffff' : C.liq, transparent: true, opacity: colorAttr ? 1 : 0.65, depthWrite: false});
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const sandPts = makePoints(NS, 0.085, true);
const liqPts = makePoints(NL, 0.05, false);
const tmp = [0, 0, 0];
const col = new THREE.Color();

// ---------------------------------------------------------------- rótulos
const labels = [
  {text: 'ENTRADA', sub: 'licor do retorno do alimentador', p: [0.3, 1.75, 1.7], c: C.liq},
  {text: 'OVERFLOW', sub: 'licor limpo → bomba de circulação', p: [1.8, 2.55, 0], c: C.liq},
  {text: 'UNDERFLOW', sub: 'areia + pouca água', p: [0.5, 0.3, 0], c: C.sand},
  {text: 'CÂMARA DE AREIA', sub: 'retém e descarrega por ciclos', p: [0.5, -0.9, 0], c: C.sand},
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
#cap i{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:${C.sand}}
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
td,th{padding:4px 2px;border-top:1px solid #eadfcd;white-space:nowrap;text-align:left}
th{color:#8c7f6d;font-weight:600;border-top:0}
td.n,th.n{text-align:right}
input[type=range]{width:100%;accent-color:${C.ink}}
.sl{margin-top:8px}
.sl span{display:flex;justify-content:space-between;font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d;text-transform:uppercase;letter-spacing:.8px}
.lab{position:absolute;transform:translate(-50%,-100%);font:700 10px 'JetBrains Mono',monospace;letter-spacing:.8px;text-align:center;white-space:nowrap;pointer-events:none;text-shadow:0 0 4px #ece6d8,0 0 4px #ece6d8}
.lab small{display:block;font-weight:600;color:#8c7f6d;letter-spacing:.4px}
#note{font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d}
.bar{height:10px;background:#eadfcd;border-radius:5px;overflow:hidden;margin-top:4px}
.bar i{display:block;height:100%;background:${C.sand}}
.st{display:inline-block;padding:2px 6px;border-radius:3px;color:#fff;font-size:9px}
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
el(`<b>Separador de areia</b><div>HIDROCICLONE · CIRCUITO DO ALIMENTADOR · POLPAÇÃO</div>`, 'ui card').id = 'title';
const left = el(
  `<div class="card"><div class="h">Processo</div>
   <div class="kpi"><div>Vazão<b id="k-q">250<small> m³/h</small></b></div><div>Queda de pressão<b id="k-dp">–<small> bar</small></b></div>
   <div>Vel. de entrada<b id="k-v">–<small> m/s</small></b></div><div>Aceleração<b id="k-g">–<small> g</small></b></div></div>
   <div class="sl"><span>Vazão de licor<em id="v-q" style="font-style:normal"></em></span><input id="q" type="range" min="80" max="400" step="5" value="250"></div>
   <div class="sl"><span>Areia na alimentação<em id="v-c" style="font-style:normal"></em></span><input id="c" type="range" min="0.05" max="2" step="0.05" value="0.5"></div>
   <div class="sl"><span>Tempo acelerado<em id="v-a" style="font-style:normal"></em></span><input id="a" type="range" min="1" max="200" step="1" value="60"></div></div>
   <div class="card"><div class="h">Câmara de areia</div>
   <div class="kpi"><div>Nível<b id="k-lvl">0<small> %</small></b></div><div>Estado<b id="k-st" style="font-size:12px;padding-top:6px"></b></div></div>
   <div class="bar"><i id="lvl" style="width:0%"></i></div>
   <div id="note" style="margin-top:6px" id="k-fill"></div></div>`,
  'ui',
);
left.id = 'left';
const right = el(
  `<div class="card"><div class="h">Eficiência × tamanho da partícula</div><canvas id="chart" width="276" height="140"></canvas>
   <div id="note" style="margin-top:6px">Curva preta: eficiência. Faixa marrom: distribuição da areia. Linha vermelha: d50.</div></div>
   <div class="card"><div class="h">Balanço</div>
   <table><tr><th></th><th class="n">licor m³/h</th><th class="n">areia kg/h</th></tr>
   <tr><td>Entrada</td><td class="n" id="b-qi"></td><td class="n" id="b-si"></td></tr>
   <tr><td style="color:${C.liq}">Overflow</td><td class="n" id="b-qo"></td><td class="n" id="b-so"></td></tr>
   <tr><td style="color:${C.sand}">Underflow</td><td class="n" id="b-qu"></td><td class="n" id="b-su"></td></tr></table>
   <div style="margin-top:8px" class="kpi"><div>Corte d50<b id="k-d50">–<small> µm</small></b></div><div>Eficiência global<b id="k-eff">–<small> %</small></b></div></div></div>`,
  'ui',
);
right.id = 'right';
const bottom = el(
  `<div class="card"><div id="cap"><i></i><span id="cap-t"></span></div></div>
   <div class="card"><div class="row" id="ctl"></div>
   <div id="note" style="margin-top:6px">Modelo didático: dimensões e propriedades são ilustrativas. Confira com o manual do seu equipamento. Arraste para girar · roda para zoom · espaço pausa.</div></div>`,
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
};
mk('tour', '● Tour automático');
mk('play', '❚❚ Pausar');
for (const [id, l] of [['hero', '1 Isométrica'], ['side', '2 Lateral'], ['top', '3 Superior'], ['cham', '4 Câmara']]) mk(id, l);
mk('section', 'Corte');
mk('liquor', 'Ocultar licor');
const labEls = labels.map((l) => {
  const d = el(`<span>${l.text}</span><small>${l.sub}</small>`, 'lab');
  d.style.color = l.c;
  return d;
});
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- câmera, estado e tour
const VIEWS = {
  hero: {az: 38, el: 20, d: 8.6, ty: 0.05},
  side: {az: 0, el: 4, d: 8.8, ty: 0.05},
  top: {az: 20, el: 84, d: 6.2, ty: 1.3},
  cham: {az: 28, el: 8, d: 4.2, ty: -0.7},
};
const cam = {...VIEWS.hero};
let view = 'hero';
const off = {az: 0, el: 0, k: 1};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const tog = {section: false, liquor: true};
let paused = false;
let T = 0;
let lastInput = 0;
let Qh = 250;
let conc = 0.5;
let accel = 60;
let level = 0.15; // fração da câmara cheia
let cyc = {state: 'COLETANDO', t: 0};
let anim = 0;

const TOUR = [
  {t: 0, view: 'hero', section: false, liquor: true, text: 'O licor que volta do alimentador de alta pressão leva areia e cascalho junto dos cavacos. O separador de areia é um hidrociclone que tira esse abrasivo antes que ele desgaste o alimentador e as bombas.'},
  {t: 11, view: 'top', section: false, liquor: true, text: 'A entrada é tangencial: o licor entra encostado na parede e gira, criando um vórtice. A aceleração chega a algumas dezenas de vezes a gravidade.'},
  {t: 22, view: 'side', section: true, liquor: true, text: 'No corte: a areia (marrom), mais densa, é jogada para a parede e desce em espiral pelo cone. O licor limpo e as partículas finas voltam pelo núcleo e sobem pelo tubo de vórtice.'},
  {t: 34, view: 'side', section: true, liquor: false, text: 'Só os grãos: marrom é areia retida, vermelho é areia que escapou pelo overflow. Mexa na vazão para ver o corte mudar: mais vazão, mais aceleração, menor d50.'},
  {t: 46, view: 'cham', section: false, liquor: true, text: 'A areia cai na câmara. Quando o nível chega a 90%, a válvula de cima fecha, a de baixo abre e a câmara descarrega. Depois fecha e reabre a de cima para voltar a coletar.'},
  {t: 58, view: 'hero', section: false, liquor: true, text: 'Agora é com você: ajuste a vazão e a areia na alimentação, abra o corte, gire a câmera. O tour volta sozinho após 25 s sem mexer.'},
];
const TOUR_LEN = 70;
let tourOn = true;
let tourT0 = 0;
let tourStep = -1;

const setView = (v) => {
  view = v;
  Object.assign(off, {az: 0, el: 0, k: 1});
};
const setToggle = (k, on) => {
  tog[k] = on;
  btn[k].classList.toggle('on', k === 'liquor' ? !on : on);
};
const takeOver = () => {
  lastInput = T;
  if (!tourOn) return;
  tourOn = false;
  btn.tour.classList.remove('on');
  btn.tour.textContent = '▶ Retomar tour';
  $('cap').classList.remove('on');
};
const startTour = () => {
  tourOn = true;
  tourT0 = T;
  tourStep = -1;
  paused = false;
  btn.tour.classList.add('on');
  btn.tour.textContent = '● Tour automático';
  $('cap').classList.add('on');
};
btn.tour.addEventListener('click', () => (tourOn ? takeOver() : startTour()));
btn.play.addEventListener('click', () => {
  takeOver();
  paused = !paused;
  btn.play.textContent = paused ? '▶ Continuar' : '❚❚ Pausar';
});
for (const v of Object.keys(VIEWS))
  btn[v].addEventListener('click', () => {
    takeOver();
    setView(v);
  });
btn.section.addEventListener('click', () => {
  takeOver();
  setToggle('section', !tog.section);
});
btn.liquor.addEventListener('click', () => {
  takeOver();
  setToggle('liquor', !tog.liquor);
});
$('q').addEventListener('input', () => {
  takeOver();
  Qh = Number($('q').value);
});
$('c').addEventListener('input', () => {
  takeOver();
  conc = Number($('c').value);
});
$('a').addEventListener('input', () => {
  takeOver();
  accel = Number($('a').value);
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const m = {1: 'hero', 2: 'side', 3: 'top', 4: 'cham'}[e.key];
  if (m) btn[m].click();
  else if (e.key === ' ') btn.play.click();
  else if (e.key === 's') btn.section.click();
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

// ---------------------------------------------------------------- gráfico
const chart = $('chart');
const cx = chart.getContext('2d');
const LX0 = Math.log(1e-5);
const LX1 = Math.log(1e-3);
function drawChart(m) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (chart.width !== 276 * dpr) {
    chart.width = 276 * dpr;
    chart.height = 140 * dpr;
    chart.style.width = '276px';
    chart.style.height = '140px';
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, 276, 140);
  const X = (d) => 8 + ((Math.log(d) - LX0) / (LX1 - LX0)) * 260;
  const Y = (e) => 118 - e * 104;
  cx.font = "600 9px 'JetBrains Mono',monospace";
  cx.fillStyle = '#8c7f6d';
  cx.strokeStyle = '#eadfcd';
  cx.lineWidth = 1;
  for (const e of [0, 0.5, 1]) {
    cx.beginPath();
    cx.moveTo(8, Y(e));
    cx.lineTo(268, Y(e));
    cx.stroke();
    cx.fillText(`${e * 100}%`, 0, Y(e) - 2);
  }
  for (const d of [1e-5, 1e-4, 1e-3]) cx.fillText(`${d * 1e6}µm`, X(d) - 8, 134);
  // distribuição
  let mx = 0;
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const d = Math.exp(LX0 + ((LX1 - LX0) * i) / 120);
    const v = pdf(d) * d;
    pts.push([d, v]);
    mx = Math.max(mx, v);
  }
  cx.fillStyle = 'rgba(184,134,47,.28)';
  cx.beginPath();
  cx.moveTo(X(pts[0][0]), Y(0));
  for (const [d, v] of pts) cx.lineTo(X(d), Y((v / mx) * 0.9));
  cx.lineTo(X(pts[pts.length - 1][0]), Y(0));
  cx.fill();
  // curva de eficiência
  cx.strokeStyle = C.ink;
  cx.lineWidth = 1.8;
  cx.beginPath();
  pts.forEach(([d], i) => {
    const x = X(d);
    const y = Y(eta(d, m.d50));
    if (i === 0) cx.moveTo(x, y);
    else cx.lineTo(x, y);
  });
  cx.stroke();
  cx.strokeStyle = C.lost;
  cx.lineWidth = 1.2;
  cx.setLineDash([3, 3]);
  cx.beginPath();
  cx.moveTo(X(m.d50), 6);
  cx.lineTo(X(m.d50), 118);
  cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle = C.lost;
  cx.fillText(`d50 ${(m.d50 * 1e6).toFixed(0)}µm`, Math.min(X(m.d50) + 3, 215), 16);
}

// ---------------------------------------------------------------- laço
const target = new THREE.Vector3();
const v3 = new THREE.Vector3();
const resize = () => {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();
btn.tour.classList.add('on');
$('cap').classList.add('on');
setToggle('section', false);
setToggle('liquor', true);
$('cap-t').textContent = TOUR[0].text;
const LIFE = 5;
const STATE_COLOR = {COLETANDO: C.ok, ISOLANDO: '#c98a1c', DESCARREGANDO: C.bad, FECHANDO: '#c98a1c', REPRESSURIZANDO: '#8a6fb0'};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  T += dt;

  if (tourOn) {
    const c = (T - tourT0) % TOUR_LEN;
    let i = 0;
    for (let j = 0; j < TOUR.length; j++) if (c >= TOUR[j].t) i = j;
    if (i !== tourStep) {
      tourStep = i;
      const s = TOUR[i];
      setView(s.view);
      setToggle('section', s.section);
      setToggle('liquor', s.liquor);
      $('cap-t').textContent = s.text;
    }
  } else if (T - lastInput > 25) startTour();

  const m = model(Qh);
  const E = globalEff(m.d50);
  const sandIn = m.Q * conc; // kg/s
  const sandKept = sandIn * E;
  const step = paused ? 0 : dt;

  // câmara e ciclo de descarga
  if (!paused) {
    cyc.t += dt;
    if (cyc.state === 'COLETANDO') {
      level = clamp(level + (sandKept * dt * accel) / CH_KG, 0, 1);
      if (level >= 0.9) Object.assign(cyc, {state: 'ISOLANDO', t: 0});
    } else if (cyc.state === 'ISOLANDO' && cyc.t > 2) Object.assign(cyc, {state: 'DESCARREGANDO', t: 0});
    else if (cyc.state === 'DESCARREGANDO') {
      level = Math.max(0, level - (0.9 / 6) * dt);
      if (cyc.t > 6) Object.assign(cyc, {state: 'FECHANDO', t: 0});
    } else if (cyc.state === 'FECHANDO' && cyc.t > 2) Object.assign(cyc, {state: 'REPRESSURIZANDO', t: 0});
    else if (cyc.state === 'REPRESSURIZANDO' && cyc.t > 3) Object.assign(cyc, {state: 'COLETANDO', t: 0});
  }
  const upOpen = cyc.state === 'COLETANDO' || cyc.state === 'REPRESSURIZANDO' || cyc.state === 'ISOLANDO' ? cyc.state !== 'ISOLANDO' : false;
  const dnOpen = cyc.state === 'DESCARREGANDO';
  vUp.material.color.set(upOpen ? C.ok : C.bad);
  vDn.material.color.set(dnOpen ? C.ok : C.bad);
  const lv = level * G.chamH;
  sandMesh.scale.set(1, Math.max(0.001, lv), 1);
  sandMesh.position.y = -0.5 - G.chamH + lv / 2;
  sandMesh.visible = lv > 0.002;

  // partículas (as da câmara só descem se a válvula de cima estiver aberta)
  anim += step * (Qh / G.Q0);
  const pos = sandPts.geometry.attributes.position.array;
  const colr = sandPts.geometry.attributes.color.array;
  for (let i = 0; i < NS; i++) {
    const p = sandP[i];
    const x = p.t0 + anim / LIFE;
    const ci = Math.floor(x);
    if (ci !== p.cyc) {
      p.cyc = ci;
      const captured = p.u < eta(p.d, m.d50);
      p.kind = captured ? 0 : 1;
      col.set(captured ? C.sand : C.lost);
      colr[i * 3] = col.r;
      colr[i * 3 + 1] = col.g;
      colr[i * 3 + 2] = col.b;
    }
    pathPos(p.kind, x - ci, p.ph, tmp);
    pos[i * 3] = tmp[0];
    pos[i * 3 + 1] = tmp[1];
    pos[i * 3 + 2] = tmp[2];
  }
  sandPts.geometry.attributes.position.needsUpdate = true;
  sandPts.geometry.attributes.color.needsUpdate = true;
  const lpos = liqPts.geometry.attributes.position.array;
  for (let i = 0; i < NL; i++) {
    const p = liqP[i];
    const x = p.t0 + anim / LIFE;
    const ci = Math.floor(x);
    pathPos(p.kind, x - ci, p.ph, tmp);
    lpos[i * 3] = tmp[0];
    lpos[i * 3 + 1] = tmp[1];
    lpos[i * 3 + 2] = tmp[2];
  }
  liqPts.geometry.attributes.position.needsUpdate = true;
  liqPts.visible = tog.liquor;

  const clip = tog.section ? [clipPlane] : [];
  for (const mt of clipMats) mt.clippingPlanes = clip;
  inlet.visible = !tog.section;

  // câmera
  const tv = VIEWS[view];
  const k = 1 - Math.exp(-dt / 0.35);
  cam.az += wrap(tv.az + off.az - cam.az) * k;
  cam.el += (clamp(tv.el + off.el, -30, 89) - cam.el) * k;
  cam.d += (tv.d * off.k - cam.d) * k;
  cam.ty += (tv.ty - cam.ty) * k;
  const az = (cam.az * Math.PI) / 180;
  const el = (cam.el * Math.PI) / 180;
  target.set(0.1, cam.ty, 0);
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(cam.d).add(target);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  renderer.render(scene, camera);

  labels.forEach((l, i) => {
    v3.set(...l.p).project(camera);
    const d = labEls[i];
    d.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`;
    d.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
    d.style.display = v3.z < 1 && view !== 'top' ? 'block' : 'none';
  });

  // painéis
  $('v-q').textContent = `${Qh} m³/h`;
  $('v-c').textContent = `${conc.toFixed(2)} kg/m³`;
  $('v-a').textContent = `×${accel}`;
  $('k-q').innerHTML = `${Qh}<small> m³/h</small>`;
  $('k-dp').innerHTML = `${(m.dP / 1e5).toFixed(2)}<small> bar</small>`;
  $('k-v').innerHTML = `${m.vIn.toFixed(1)}<small> m/s</small>`;
  $('k-g').innerHTML = `${m.g.toFixed(0)}<small> g</small>`;
  $('k-lvl').innerHTML = `${Math.round(level * 100)}<small> %</small>`;
  $('k-st').innerHTML = `<span class="st" style="background:${STATE_COLOR[cyc.state]}">${cyc.state}</span>`;
  $('lvl').style.width = `${level * 100}%`;
  const tFill = sandKept > 0 ? (0.9 * CH_KG) / sandKept / 60 : Infinity;
  document.querySelectorAll('#left #note')[0].textContent = `Câmara: ${CH_KG.toFixed(0)} kg. Enche em ~${Number.isFinite(tFill) ? tFill.toFixed(0) : '–'} min de operação real (tempo acelerado ×${accel} na tela).`;
  $('k-d50').innerHTML = `${(m.d50 * 1e6).toFixed(0)}<small> µm</small>`;
  $('k-eff').innerHTML = `${(E * 100).toFixed(0)}<small> %</small>`;
  $('b-qi').textContent = Qh.toFixed(0);
  $('b-si').textContent = (sandIn * 3600).toFixed(0);
  $('b-qo').textContent = (Qh * (1 - G.underSplit)).toFixed(0);
  $('b-so').textContent = (sandIn * (1 - E) * 3600).toFixed(0);
  $('b-qu').textContent = (Qh * G.underSplit).toFixed(0);
  $('b-su').textContent = (sandKept * 3600).toFixed(0);
  drawChart(m);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.SEP = {model, eta, globalEff, G};
