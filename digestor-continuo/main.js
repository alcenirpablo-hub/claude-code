// Digestor contínuo de fase líquida (tipo Kamyr/Andritz) e periféricos principais.
// Uma entrada de operação (produção + temperatura) comanda: coluna de cavacos, perfis, painéis, gráfico e fluxos.
import * as THREE from 'three';

// ---------------------------------------------------------------- dados do processo (ilustrativos)
const D = {
  R: 3.5, // raio do vaso (m)
  y0: 14, // fundo da parte reta
  y1: 62, // topo da parte reta
  H: 48, // altura da coluna de cavacos (m)
  woodPerADT: 1.92, // odt de madeira por ADT de celulose (rendimento ~47%)
  colDens: 0.18, // odt/m³ de coluna de cavacos
  chipBulk: 0.17, // odt/m³ de cavacos soltos (a granel)
  eaCharge: 0.18, // álcali efetivo / madeira (como NaOH)
  wlEA: 100, // g/L de álcali efetivo no licor branco
  lw: 4.0, // relação licor/madeira (m³/odt)
};
const AREA = Math.PI * D.R * D.R;
// zonas (profundidade em m a partir do topo da coluna)
const ZONES = [
  {id: 'imp', name: 'Impregnação', a: 0, b: 9, c: '#d9a441'},
  {id: 'cc', name: 'Cozimento co-corrente', a: 9, b: 24, c: '#e3562a'},
  {id: 'mcc', name: 'Cozimento contracorrente', a: 24, b: 34, c: '#b83a1e'},
  {id: 'wash', name: 'Lavagem (HiHeat)', a: 34, b: 48, c: '#2f7fb8'},
];
const zoneAt = (z) => ZONES.find((q) => z < q.b) || ZONES[3];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const rate = (T) => Math.exp(43.18 - 16113 / (T + 273.15)); // taxa de fator H (1 a 100 °C)

/** Perfil de temperatura ao longo da profundidade z (m). */
function tempAt(z, Tc) {
  if (z < 6) return lerp(108, 125, smooth(z / 6));
  if (z < 10) return lerp(125, Tc, smooth((z - 6) / 4));
  if (z < 24) return Tc;
  if (z < 34) return Tc - 3;
  if (z < 44) return lerp(Tc - 3, 100, smooth((z - 34) / 10));
  return lerp(100, 94, smooth((z - 44) / 4));
}

const NP = 241;
/** Modelo completo: função pura de (P em ADT/dia, Tc em °C). */
function model(P, Tc) {
  const wood = (P * D.woodPerADT) / 24; // odt/h
  const bulk = wood / D.chipBulk; // m³/h de cavacos soltos
  const qCol = wood / D.colDens; // m³/h de coluna
  const v = qCol / AREA; // m/h
  const res = D.H / v; // h
  const T = new Float32Array(NP);
  const Hc = new Float32Array(NP);
  const dz = D.H / (NP - 1);
  let h = 0;
  for (let i = 0; i < NP; i++) {
    const z = i * dz;
    T[i] = tempAt(z, Tc);
    if (i > 0) h += ((rate(T[i]) + rate(T[i - 1])) / 2) * (dz / v);
    Hc[i] = h;
  }
  const Hend = h;
  const kEnd = clamp(160 - 42 * Math.log10(Math.max(Hend, 60)), 14, 120);
  const K = new Float32Array(NP);
  const pEnd = Math.log10(1 + Hend);
  for (let i = 0; i < NP; i++) K[i] = lerp(150, kEnd, Math.pow(Math.log10(1 + Hc[i]) / pEnd, 0.9));
  const ea = D.eaCharge * wood; // t/h NaOH
  const qWL = (ea * 1000) / D.wlEA; // m³/h (1 t/h = 1000 kg/h; g/L = kg/m³)
  const qLiq = D.lw * wood;
  return {wood, bulk, qCol, v, res, T, Hc, K, Hend, kEnd, ea, qWL, qLiq};
}
const idx = (z) => clamp(Math.round((z / D.H) * (NP - 1)), 0, NP - 1);
const lerpC = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const C_RAW = [0.93, 0.8, 0.52];
const C_COOK = [0.42, 0.24, 0.1];
const kColor = (K) => lerpC(C_RAW, C_COOK, clamp((150 - K) / 130, 0, 1));

// ---------------------------------------------------------------- cena
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e1d2');
scene.fog = new THREE.Fog('#e8e1d2', 220, 520);
const camera = new THREE.PerspectiveCamera(34, 1, 1, 900);
scene.add(new THREE.HemisphereLight('#ffffff', '#b9ad96', 1.05));
const sun = new THREE.DirectionalLight('#fff6e8', 2.3);
sun.position.set(60, 140, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 420});
sun.shadow.bias = -0.0006;
scene.add(sun);
const rim = new THREE.DirectionalLight('#cfe0ff', 0.7);
rim.position.set(-80, 40, -60);
scene.add(rim);

const C = {ink: '#2a2521', steel: '#8d99a3', dark: '#566069', hot: '#e3562a', cold: '#2f7fb8', black: '#3a2a20', white: '#9aa84a', chip: '#d9b878', pulp: '#8b5a2e', steam: '#b9c4cc', conc: '#cfc9bd'};
const std = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.55, metalness: 0.45, ...o});
const solid = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const ground = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.MeshStandardMaterial({color: '#d8d0bf', roughness: 1}));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const slab = new THREE.Mesh(new THREE.BoxGeometry(150, 0.6, 50), new THREE.MeshStandardMaterial({color: C.conc, roughness: 0.95}));
slab.position.set(-14, 0.3, 0);
slab.receiveShadow = true;
scene.add(slab);

const plant = new THREE.Group();
scene.add(plant);
const shellMats = []; // materiais que ficam transparentes / cortados
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

function cyl(r, h, x, y, z, mat, o = {}) {
  const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg ?? 40, 1, !!o.open);
  if (o.axis === 'x') g.rotateZ(Math.PI / 2);
  if (o.axis === 'z') g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  if (!o.noShadow) solid(m);
  plant.add(m);
  return m;
}
function box(w, h, d, x, y, z, mat) {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  plant.add(m);
  return m;
}
function sph(r, x, y, z, mat, sy = 1) {
  const m = solid(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), mat));
  m.position.set(x, y, z);
  m.scale.y = sy;
  plant.add(m);
  return m;
}
const pipeMat = std('#6f7c86', {roughness: 0.5});
const pipeMatHot = std('#8a5d4c', {roughness: 0.55});
const pipeGroup = new THREE.Group();
plant.add(pipeGroup);
/** Tubulação por trechos retos com juntas esféricas. */
function pipe(points, r, mat = pipeMat) {
  const v = points.map((p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0));
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i];
    const b = v[i + 1];
    const len = a.distanceTo(b);
    if (len < 1e-3) continue;
    const m = solid(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    pipeGroup.add(m);
    if (i > 0) {
      const j = solid(new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 12, 8), mat));
      j.position.copy(a);
      pipeGroup.add(j);
    }
  }
  return points;
}
const labels = [];
const lab = (id, text, sub, p, c, groups) => labels.push({id, text, sub, p, c, groups});

// ---------------------------------------------------------------- digestor
const shellMat = std('#aab4bc', {roughness: 0.4, metalness: 0.55, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: []});
shellMats.push(shellMat);
const vessel = new THREE.Mesh(new THREE.CylinderGeometry(D.R, D.R, D.H, 64, 1, true), shellMat);
vessel.position.y = (D.y0 + D.y1) / 2;
plant.add(vessel);
const dome = new THREE.Mesh(new THREE.SphereGeometry(D.R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
dome.scale.y = 0.45;
dome.position.y = D.y1;
plant.add(dome);
const botCone = new THREE.Mesh(new THREE.CylinderGeometry(D.R, 0.9, 4, 48, 1, true), shellMat);
botCone.position.y = D.y0 - 2;
plant.add(botCone);
const ringMat = std('#5b6670');
for (let y = D.y0; y <= D.y1 + 0.1; y += 6) {
  const t = solid(new THREE.Mesh(new THREE.TorusGeometry(D.R + 0.02, 0.1, 8, 64), ringMat));
  t.rotation.x = Math.PI / 2;
  t.position.y = y;
  plant.add(t);
}
// coluna de cavacos (cilindro com cor por profundidade)
const SEG = 96;
const colGeo = new THREE.CylinderGeometry(D.R - 0.08, D.R - 0.08, D.H, 48, SEG, true);
colGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colGeo.attributes.position.count * 3), 3));
const colMat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, clippingPlanes: []});
shellMats.push(colMat);
const column = new THREE.Mesh(colGeo, colMat);
column.position.y = (D.y0 + D.y1) / 2;
plant.add(column);
// tubos centrais de retorno das circulações (dentro do vaso)
const innerMat = std('#6a747d');
cyl(0.35, 13.5, 0, 56.6, 0, innerMat); // circulação superior (y 50 a 63,4)
cyl(0.35, 8, 0, 30, 0, innerMat); // circulação inferior (y 26 a 34)
// peneiras (telas) em anéis
const screenMat = std('#2a2521', {roughness: 0.6});
function screenRing(y, c) {
  const m = solid(new THREE.Mesh(new THREE.CylinderGeometry(D.R + 0.12, D.R + 0.12, 1.4, 48, 1, true), std(c, {side: THREE.DoubleSide, roughness: 0.5})));
  m.position.y = y;
  plant.add(m);
  const t = solid(new THREE.Mesh(new THREE.TorusGeometry(D.R + 0.12, 0.08, 8, 48), screenMat));
  t.rotation.x = Math.PI / 2;
  t.position.y = y + 0.7;
  plant.add(t);
}
screenRing(D.y1 - 9, '#d9a441'); // circulação superior (z=9)
screenRing(D.y1 - 24, '#3a2a20'); // extração (z=24)
screenRing(D.y1 - 34, '#e3562a'); // circulação inferior (z=34)
// anéis de zona
for (const q of ZONES) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(D.R + 0.45, 0.1, 8, 64), new THREE.MeshBasicMaterial({color: q.c}));
  t.rotation.x = Math.PI / 2;
  t.position.y = D.y1 - q.a - 0.05;
  plant.add(t);
}
// separador de topo
const topSep = cyl(1.2, 8.6, 0, 67.6, 0, shellMat, {open: true});
for (let i = 0; i < 6; i++) {
  const r = solid(new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.06, 6, 32), ringMat));
  r.rotation.x = Math.PI / 2;
  r.position.y = 64.3 + i * 1.2;
  plant.add(r);
}
sph(1.2, 0, 71.9, 0, std('#7b8791'), 0.5);
const screw = cyl(0.25, 8, 0, 68, 0, std('#4c555c'), {noShadow: true});
// fundo: dispositivo de descarga (raspador)
const scraper = box(6.2, 0.4, 0.6, 0, 14.3, 0, std('#4c555c'));
cyl(0.5, 3, 0, 12.3, 0, std('#4c555c'));
// plataformas e torre de apoio
const gratingMat = std('#6f6b63', {roughness: 0.8, metalness: 0.3});
for (const y of [14, 26, 38, 50, 62]) {
  const p = solid(new THREE.Mesh(new THREE.RingGeometry(D.R + 0.3, D.R + 3.2, 64), new THREE.MeshStandardMaterial({color: '#6f6b63', roughness: 0.85, side: THREE.DoubleSide})));
  p.rotation.x = -Math.PI / 2;
  p.position.y = y - 0.4;
  plant.add(p);
  const rl = new THREE.Mesh(new THREE.TorusGeometry(D.R + 3.2, 0.06, 6, 64), std('#e0b020'));
  rl.rotation.x = Math.PI / 2;
  rl.position.y = y + 0.7;
  plant.add(rl);
}
for (const [x, z] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) cyl(0.35, 62, x * 0.9, 31, z * 0.9, std('#566069'), {seg: 8});
for (const y of [14, 26, 38, 50, 62]) for (const s of [-1, 1]) {
  box(14.4, 0.25, 0.3, 0, y - 0.6, s * 7.2, std('#566069'));
  box(0.3, 0.25, 14.4, s * 7.2, y - 0.6, 0, std('#566069'));
}
lab('dig', 'DIGESTOR CONTÍNUO', 'vaso de fase líquida · 48 m de coluna', [0, 64.5, 4.5], C.ink, ['all', 'dig', 'top']);
lab('topsep', 'SEPARADOR DE TOPO', 'cavacos descem, licor volta', [4, 72.5, 0], C.cold, ['all', 'top']);
lab('scr1', 'TELAS DE CIRC. SUPERIOR', 'licor ao aquecedor', [5.3, 53.4, 0], '#b58a22', ['dig']);
lab('scr2', 'TELAS DE EXTRAÇÃO', 'licor preto para flash', [5.3, 38.4, 0], C.black, ['dig']);
lab('scr3', 'TELAS DE CIRC. INFERIOR', 'licor ao aquecedor', [5.3, 28.4, 0], C.hot, ['dig']);
lab('out', 'DISPOSITIVO DE DESCARGA', 'raspador do fundo', [4.5, 12.6, 0], C.ink, ['all', 'bottom']);
for (const q of ZONES) lab('z-' + q.id, q.name.toUpperCase(), '', [-4.6, D.y1 - (q.a + q.b) / 2, 0], q.c, ['dig']);

// ---------------------------------------------------------------- alimentação: silo, medidor, vaporização, alimentador, ciclone
const bin = cyl(6, 16, -64, 78, 0, std('#b7b09f', {roughness: 0.7, metalness: 0.2}));
cyl(0.5, 8, -64, 69, 0, std('#6f7c86'), {r2: 4, noShadow: true});
cyl(2.8, 5, -64, 69.2, 0, std('#7b8791'), {r2: 0.7}); // funil
box(3, 3, 3, -64, 66.2, 0, std('#4c555c')); // medidor de cavacos
sph(1.8, -64, 64.5, 0, std('#5b6670')); // alimentador de baixa pressão
const steam = cyl(1.8, 18, -50, 62.5, 0, std('#a9b3ba'), {axis: 'x'}); // vaso de vaporização
sph(1.8, -41, 62.5, 0, std('#a9b3ba'));
cyl(0.9, 8, -40, 58, 0, pipeMat); // calha de cavacos
const hpf = sph(2.4, -40, 52.5, 0, std('#e07a3a', {roughness: 0.45})); // alimentador de alta pressão
cyl(1.5, 3.2, -40, 52.5, 0, std('#4c555c'), {axis: 'z'});
box(8, 0.8, 5, -40, 46, 0, std('#4c555c'));
const sand = cyl(1.2, 3, -26, 56.5, 0, std('#6f8a5e')); // separador de areia
cyl(1.2, 8, -26, 51, 0, std('#6f8a5e'), {r2: 0.2});
const sandMesh = sand;
box(8, 0.5, 8, -26, 46.5, 0, std('#4c555c'));
lab('bin', 'SILO DE CAVACOS', 'cavacos de 6 a 25 mm', [-64, 87, 0], C.ink, ['all', 'feed']);
lab('meter', 'MEDIDOR + ALIM. BAIXA PRESSÃO', 'dosa e veda', [-64, 61.6, 0], C.ink, ['feed']);
lab('steam', 'VASO DE VAPORIZAÇÃO', '~1 bar · remove ar', [-50, 66, 0], C.steam, ['all', 'feed']);
lab('chute', 'CALHA DE CAVACOS', 'baixa pressão', [-40, 67.2, 0], C.cold, ['feed']);
lab('hpf', 'ALIM. DE ALTA PRESSÃO', 'válvula rotativa', [-40, 48.6, 0], '#e07a3a', ['all', 'feed']);
lab('sand', 'SEPARADOR DE AREIA', 'hidrociclone', [-26, 60, 0], '#6f8a5e', ['all', 'feed']);

// ---------------------------------------------------------------- tubulações e fluxos
const streams = [];
function stream(points, r, color, n, kind, base, mat = pipeMat) {
  pipe(points, r, mat);
  const segs = [];
  let L = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(points[i][0], points[i][1], points[i][2] ?? 0);
    const b = new THREE.Vector3(points[i + 1][0], points[i + 1][1], points[i + 1][2] ?? 0);
    segs.push({a, b, l: a.distanceTo(b), s0: L});
    L += a.distanceTo(b);
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mt = new THREE.PointsMaterial({color, size: kind === 'chip' ? 1.3 : 1.05, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false});
  const pts = new THREE.Points(geo, mt);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  const seeds = Array.from({length: n}, (_, i) => ({u: (i + Math.random() * 0.3) / n, o: (Math.random() - 0.5) * r * 1.2, p: (Math.random() - 0.5) * r * 1.2}));
  const st = {segs, L, pts, pos, geo, seeds, base, mt, t: 0};
  streams.push(st);
  return st;
}
const v3a = new THREE.Vector3();
function updateStream(st, dt, k) {
  st.t += dt * k * (st.base ?? 1);
  const speed = 9; // m/s de visualização
  for (let i = 0; i < st.seeds.length; i++) {
    const q = st.seeds[i];
    const s = (((q.u + (st.t * speed) / st.L) % 1) + 1) % 1 * st.L;
    let g = st.segs[st.segs.length - 1];
    for (const sg of st.segs) if (s <= sg.s0 + sg.l) {
      g = sg;
      break;
    }
    v3a.copy(g.a).lerp(g.b, clamp((s - g.s0) / g.l, 0, 1));
    st.pos[i * 3] = v3a.x + q.o;
    st.pos[i * 3 + 1] = v3a.y + q.p;
    st.pos[i * 3 + 2] = v3a.z + q.o * 0.6;
  }
  st.geo.attributes.position.needsUpdate = true;
}
// cavacos até o alimentador de alta pressão
stream([[-64, 62], [-64, 62.5], [-58, 62.5], [-41, 62.5], [-40, 62.5], [-40, 56]], 0.7, C.chip, 60, 'chip', 0.35);
// circulação de transferência: alimentador -> separador de topo (cavacos + licor)
stream([[-40, 54.5], [-40, 70.4], [-1.2, 70.4]], 0.75, C.chip, 120, 'chip', 1.1);
// retorno do separador de topo -> ciclone de areia -> alimentador
stream([[1.2, 66.5], [8, 66.5], [8, 74], [-26, 74], [-26, 58.8]], 0.65, C.cold, 90, 'liq', 1.1);
stream([[-26, 63], [-26, 63.5], [-33, 63.5], [-33, 52.5], [-37.6, 52.5]], 0.65, C.cold, 70, 'liq', 1.1);
stream([[-26, 47.2], [-26, 45], [-20, 45], [-20, 40]], 0.35, '#b8862f', 14, 'sand', 0.5);
// licor branco
cyl(4, 10, -46, 5, 6, std('#a9b3ba', {roughness: 0.6}));
const wlPipe = stream([[-46, 10], [-46, 12], [-46, 50.5], [-37.8, 50.5]], 0.5, C.white, 60, 'wl', 0.8);
lab('wlt', 'TANQUE DE LICOR BRANCO', 'NaOH + Na₂S', [-46, 11.5, 6], C.white, ['all']);
cyl(1.2, 2, -46, 1.1, 6, std('#4c555c'), {axis: 'z'}); // bomba
pipe([[-46, 10], [-46, 12]], 0.5);
// circulação superior (telas -> aquecedor -> centro)
cyl(1.4, 14, 14, 52, 0, std('#b87348', {roughness: 0.5}));
sph(1.4, 14, 59, 0, std('#b87348'), 0.5);
sph(1.4, 14, 45, 0, std('#b87348'), 0.5);
stream([[D.R + 0.2, 53.2], [9, 53.2], [9, 45], [14, 45]], 0.6, C.hot, 70, 'liq', 0.8, pipeMatHot);
stream([[14, 59], [14, 61], [0.4, 61], [0.4, 50]], 0.6, C.hot, 80, 'liq', 0.9, pipeMatHot);
// vapor ao aquecedor superior
stream([[22, 58], [22, 52], [15.4, 52]], 0.35, '#c9d4da', 22, 'steam', 1.4);
lab('hx1', 'AQUECEDOR DE CIRC. SUPERIOR', 'vapor aquece o licor a ~160 °C', [14, 61, 0], C.hot, ['all', 'loops', 'top']);
// circulação inferior
cyl(1.4, 14, 14, 26, 0, std('#b87348', {roughness: 0.5}));
sph(1.4, 14, 33, 0, std('#b87348'), 0.5);
sph(1.4, 14, 19, 0, std('#b87348'), 0.5);
stream([[D.R + 0.2, 28.2], [9, 28.2], [9, 19], [14, 19]], 0.6, C.hot, 70, 'liq', 0.8, pipeMatHot);
stream([[14, 33], [14, 35], [0.4, 35], [0.4, 26]], 0.6, C.hot, 80, 'liq', 0.9, pipeMatHot);
stream([[22, 32], [22, 26], [15.4, 26]], 0.35, '#c9d4da', 22, 'steam', 1.4);
lab('hx2', 'AQUECEDOR DE CIRC. INFERIOR', 'mantém o cozimento contracorrente', [14, 35, 0], C.hot, ['loops']);
// extração -> flash 1 -> flash 2 -> evaporação
stream([[D.R + 0.2, 38.2], [20, 38.2], [20, 36.5], [28, 36.5]], 0.6, C.black, 80, 'liq', 0.8);
cyl(2, 9, 30, 41, 0, std('#a9b3ba'), {r2: 2});
sph(2, 30, 45.5, 0, std('#a9b3ba'), 0.5);
stream([[30, 36.5], [30, 32], [42, 32], [42, 30]], 0.55, C.black, 50, 'liq', 0.7);
cyl(2.6, 10, 42, 26, 0, std('#a9b3ba'));
sph(2.6, 42, 31, 0, std('#a9b3ba'), 0.5);
stream([[42, 21], [42, 17], [56, 17]], 0.55, C.black, 40, 'liq', 0.7);
stream([[30, 47], [30, 80], [-50, 80], [-50, 63.8]], 0.4, '#c9d4da', 120, 'steam', 1.0);
lab('fl1', 'FLASH 1', 'vapor aquece os cavacos', [30, 48.2, 0], C.steam, ['loops', 'all']);
lab('fl2', 'FLASH 2', 'recupera calor', [42, 33, 0], C.steam, ['loops']);
lab('bl', 'LICOR PRETO → EVAPORAÇÃO', 'segue para a recuperação', [56, 19, 0], C.black, ['all', 'loops']);
// lavagem em contracorrente
stream([[34, 16.5, -9], [0, 16.5, -9], [0, 16.5, -D.R - 0.2]], 0.6, C.cold, 70, 'liq', 0.9);
lab('wash', 'LICOR DE LAVAGEM', 'vem dos lavadores · sobe contra a coluna', [28, 18, -9], C.cold, ['all', 'bottom']);
// descarga: linha de sopro e tanque de descarga
stream([[0, 10.5], [0, 6], [12, 6]], 0.9, C.pulp, 70, 'pulp', 1.1);
const blowTank = cyl(5.5, 16, 18, 8, 0, std('#a9b3ba', {roughness: 0.6}));
sph(5.5, 18, 16, 0, std('#a9b3ba'), 0.35);
lab('blow', 'TANQUE DE DESCARGA', 'polpa marrom segue à lavagem', [18, 18, 0], C.pulp, ['all', 'bottom']);

// ---------------------------------------------------------------- partículas da coluna e rastreador
const NC = 1400;
const chipGeo = new THREE.BufferGeometry();
const chipPos = new Float32Array(NC * 3);
const chipCol = new Float32Array(NC * 3);
chipGeo.setAttribute('position', new THREE.BufferAttribute(chipPos, 3));
chipGeo.setAttribute('color', new THREE.BufferAttribute(chipCol, 3));
const chipPts = new THREE.Points(chipGeo, new THREE.PointsMaterial({size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false}));
chipPts.frustumCulled = false;
scene.add(chipPts);
const chipSeeds = Array.from({length: NC}, () => {
  const r = Math.sqrt(Math.random()) * (D.R - 0.3);
  const a = Math.random() * Math.PI * 2;
  return {x: r * Math.cos(a), z: r * Math.sin(a), d0: Math.random() * D.H};
});
const tracer = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshBasicMaterial({color: '#e3262a'}));
scene.add(tracer);
const tracerRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 40), new THREE.MeshBasicMaterial({color: '#e3262a', transparent: true, opacity: 0.6}));
tracerRing.rotation.x = Math.PI / 2;
scene.add(tracerRing);
// licor de lavagem subindo na zona de lavagem (contracorrente)
const NW = 160;
const wGeo = new THREE.BufferGeometry();
const wPos = new Float32Array(NW * 3);
wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
const wPts = new THREE.Points(wGeo, new THREE.PointsMaterial({color: C.cold, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false}));
wPts.frustumCulled = false;
scene.add(wPts);
const wSeeds = Array.from({length: NW}, () => {
  const r = Math.sqrt(Math.random()) * (D.R - 0.3);
  const a = Math.random() * Math.PI * 2;
  return {x: r * Math.cos(a), z: r * Math.sin(a), u: Math.random()};
});

// ---------------------------------------------------------------- interface
const css = document.createElement('style');
css.textContent = `
html,body{background:#e8e1d2;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#2a2521}
#app{position:fixed;inset:0;color:#2a2521}
#gl{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.ui{position:absolute;pointer-events:none}
.card{color:#2a2521;background:rgba(252,249,244,.94);border:1px solid #ddd2bf;border-radius:8px;padding:12px 14px;pointer-events:auto}
.h{font:700 10px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:#8c7f6d;margin-bottom:8px;text-transform:uppercase}
#title{left:16px;top:14px}
#title b{font-size:20px;letter-spacing:-.3px}
#title div{font:600 11px 'JetBrains Mono',monospace;color:#8c7f6d;margin-top:2px}
#left{left:16px;top:84px;width:300px;display:flex;flex-direction:column;gap:10px}
#right{right:16px;top:14px;width:310px;display:flex;flex-direction:column;gap:10px}
#bottom{left:50%;bottom:14px;transform:translateX(-50%);width:min(900px,calc(100vw - 680px));min-width:520px;display:flex;flex-direction:column;gap:8px;align-items:stretch}
#cap{font-size:14px;line-height:1.4;min-height:58px;display:flex;gap:10px;align-items:flex-start}
#cap i{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:${C.hot}}
#cap.on i{animation:bl 1.2s steps(2) infinite}
@keyframes bl{50%{opacity:.15}}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{font:700 10px 'JetBrains Mono',monospace;letter-spacing:1px;border:1px solid #ddd2bf;background:#fff;color:#2a2521;border-radius:5px;padding:7px 9px;cursor:pointer;text-transform:uppercase}
button:hover{background:#f6efe2}
button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.kpi{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kpi div{font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d;text-transform:uppercase;letter-spacing:.8px}
.kpi b{display:block;font:700 21px Inter,sans-serif;color:#2a2521;letter-spacing:-.5px;text-transform:none}
.kpi b small{font:600 11px 'JetBrains Mono',monospace;color:#8c7f6d}
table{width:100%;border-collapse:collapse;font:600 10px 'JetBrains Mono',monospace}
td,th{padding:4px 2px;border-top:1px solid #eadfcd;white-space:nowrap;text-align:left}
th{color:#8c7f6d;font-weight:600;border-top:0}
td.n,th.n{text-align:right}
input[type=range]{width:100%;accent-color:${C.ink}}
.sl{margin-top:8px}
.sl span{display:flex;justify-content:space-between;font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d;text-transform:uppercase;letter-spacing:.8px}
.lab{position:absolute;transform:translate(-50%,-100%);font:700 10px 'JetBrains Mono',monospace;letter-spacing:.6px;text-align:center;white-space:nowrap;pointer-events:none;text-shadow:0 0 4px #e8e1d2,0 0 4px #e8e1d2,0 0 6px #e8e1d2}
.lab small{display:block;font-weight:600;color:#7d705f;letter-spacing:.3px}
#note{font:600 10px 'JetBrains Mono',monospace;color:#8c7f6d}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
@media(max-width:1250px){#right{display:none}#bottom{width:min(900px,calc(100vw - 340px));min-width:0;left:calc(50% + 150px)}}
@media(max-width:760px){#left{display:none}#bottom{left:50%;width:calc(100vw - 24px)}.lab{font-size:8px}}
`;
document.head.appendChild(css);
const el = (html, cls = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  app.appendChild(d);
  return d;
};
const $ = (id) => document.getElementById(id);
el(`<b>Digestor contínuo</b><div>LINHA DE FIBRAS · COZIMENTO KRAFT · FASE LÍQUIDA</div>`, 'ui card').id = 'title';
el(
  `<div class="card"><div class="h">Operação</div>
   <div class="kpi"><div>Produção<b id="k-p">1000<small> ADT/d</small></b></div><div>Cozimento<b id="k-t">160<small> °C</small></b></div>
   <div>Residência<b id="k-res">–<small> h</small></b></div><div>Vel. da coluna<b id="k-v">–<small> m/h</small></b></div></div>
   <div class="sl"><span>Produção<em id="v-p" style="font-style:normal"></em></span><input id="p" type="range" min="500" max="1400" step="10" value="1000"></div>
   <div class="sl"><span>Temp. de cozimento<em id="v-t" style="font-style:normal"></em></span><input id="t" type="range" min="145" max="172" step="1" value="160"></div>
   <div class="sl"><span>Tempo acelerado<em id="v-a" style="font-style:normal"></em></span><input id="a" type="range" min="50" max="1500" step="10" value="400"></div></div>
   <div class="card"><div class="h">Resultado do cozimento</div>
   <div class="kpi"><div>Fator H<b id="k-h">–</b></div><div>Kappa estimado<b id="k-k">–</b></div>
   <div>Madeira<b id="k-w">–<small> odt/h</small></b></div><div>Licor branco<b id="k-wl">–<small> m³/h</small></b></div></div>
   <div id="note" style="margin-top:6px">Kappa pela relação empírica com o fator H (didática). Álcali de ${D.eaCharge * 100}% sobre madeira; relação licor/madeira ${D.lw}:1.</div></div>`,
  'ui',
).id = 'left';
el(
  `<div class="card"><div class="h">Perfil ao longo da coluna</div><canvas id="chart" width="286" height="170"></canvas>
   <div id="note" style="margin-top:4px"><span class="dot" style="background:${C.hot}"></span>Temperatura <span class="dot" style="background:#6a4a2a;margin-left:8px"></span>Kappa · ponto vermelho: cavaco rastreado</div></div>
   <div class="card"><div class="h">Cavaco rastreado</div>
   <table><tr><td>Zona</td><td class="n" id="tr-z"></td></tr><tr><td>Profundidade</td><td class="n" id="tr-d"></td></tr>
   <tr><td>Temperatura</td><td class="n" id="tr-t"></td></tr><tr><td>Tempo no vaso</td><td class="n" id="tr-s"></td></tr>
   <tr><td>Fator H acumulado</td><td class="n" id="tr-h"></td></tr><tr><td>Kappa</td><td class="n" id="tr-k"></td></tr></table></div>`,
  'ui',
).id = 'right';
el(
  `<div class="card"><div id="cap"><i></i><span id="cap-t"></span></div></div>
   <div class="card"><div class="row" id="ctl"></div>
   <div id="note" style="margin-top:6px">Modelo didático, não é projeto de equipamento: dimensões, temperaturas e vazões são ilustrativas. Confira com o manual do seu equipamento. Arraste para girar · roda para zoom.</div></div>`,
  'ui',
).id = 'bottom';
const ctl = $('ctl');
const btn = {};
const mk = (id, label) => {
  const b = document.createElement('button');
  b.textContent = label;
  btn[id] = b;
  ctl.appendChild(b);
};
mk('tour', '● Tour automático');
mk('play', '❚❚ Pausar');
for (const [id, l] of [['plant', '1 Planta'], ['feed', '2 Alimentação'], ['top', '3 Topo'], ['dig', '4 Digestor'], ['loops', '5 Circulações'], ['bottom', '6 Fundo']]) mk(id, l);
mk('solid', 'Casca sólida');
mk('section', 'Corte');
const labEls = labels.map((l) => {
  const d = el(`<span>${l.text}</span><small>${l.sub}</small>`, 'lab');
  d.style.color = l.c;
  return d;
});

// ---------------------------------------------------------------- câmera, estado, tour
const VIEWS = {
  plant: {az: 22, el: 10, d: 240, tx: -8, ty: 30, groups: 'all'},
  feed: {az: 18, el: 12, d: 88, tx: -42, ty: 54, groups: 'feed'},
  top: {az: 32, el: 16, d: 66, tx: 0, ty: 58, groups: 'top'},
  dig: {az: 14, el: 6, d: 128, tx: 4, ty: 30, groups: 'dig'},
  loops: {az: 6, el: 6, d: 112, tx: 22, ty: 30, groups: 'loops'},
  bottom: {az: 24, el: 14, d: 66, tx: 10, ty: 5, groups: 'bottom'},
};
const cam = {...VIEWS.plant};
let view = 'plant';
const off = {az: 0, el: 0, k: 1};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const tog = {solid: false, section: false};
let paused = false;
let T = 0;
let lastInput = 0;
let P = 1000;
let Tc = 160;
let accel = 400;
let sDisp = 0; // m de coluna percorridos (acumulado)
let M = model(P, Tc);

const TOUR = [
  {t: 0, view: 'plant', solid: false, section: false, text: 'Visão geral da linha: os cavacos saem do silo, passam pela vaporização e pelo alimentador de alta pressão e entram no topo do digestor contínuo. A polpa sai pelo fundo, rumo ao tanque de descarga.'},
  {t: 14, view: 'feed', solid: false, section: false, text: 'Alimentação: o medidor dosa os cavacos, o vaso de vaporização tira o ar e o alimentador de alta pressão leva tudo ao nível de pressão do digestor. O separador de areia limpa o licor de transferência.'},
  {t: 28, view: 'top', solid: false, section: true, text: 'No topo, o separador de topo faz a coluna de cavacos descer e devolve o licor de transferência. A impregnação começa aqui, com licor branco misturado.'},
  {t: 42, view: 'dig', solid: false, section: false, text: 'A coluna desce como um êmbolo (fluxo pistonado). A cor mostra o avanço do cozimento: do cavaco amarelo ao marrom da polpa. O ponto vermelho é um cavaco rastreado, com seus números no painel.'},
  {t: 58, view: 'loops', solid: false, section: false, text: 'Circulações: telas retiram licor, aquecedores a vapor o levam à temperatura de cozimento e ele volta pelo centro. Na extração, o licor preto vai aos flash tanques, e o vapor aquece os cavacos na vaporização.'},
  {t: 74, view: 'bottom', solid: false, section: false, text: 'No fundo, o licor de lavagem sobe contra a coluna, em contracorrente, lavando a polpa. O raspador descarrega a polpa pela linha de sopro até o tanque de descarga.'},
  {t: 90, view: 'plant', solid: false, section: false, text: 'Agora é com você: mude a produção e a temperatura, veja o fator H e o kappa responderem, abra o corte e gire a câmera. O tour volta sozinho após 25 s sem mexer.'},
];
const TOUR_LEN = 104;
let tourOn = true;
let tourT0 = 0;
let tourStep = -1;
const setView = (v) => {
  view = v;
  Object.assign(off, {az: 0, el: 0, k: 1});
  for (const k of Object.keys(VIEWS)) btn[k].classList.toggle('on', k === v && !tourOn);
};
const setToggle = (k, on) => {
  tog[k] = on;
  btn[k].classList.toggle('on', on);
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
for (const v of Object.keys(VIEWS)) btn[v].addEventListener('click', () => {
  takeOver();
  setView(v);
});
btn.solid.addEventListener('click', () => {
  takeOver();
  setToggle('solid', !tog.solid);
});
btn.section.addEventListener('click', () => {
  takeOver();
  setToggle('section', !tog.section);
});
$('p').addEventListener('input', () => {
  takeOver();
  P = Number($('p').value);
});
$('t').addEventListener('input', () => {
  takeOver();
  Tc = Number($('t').value);
});
$('a').addEventListener('input', () => {
  takeOver();
  accel = Number($('a').value);
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const m = {1: 'plant', 2: 'feed', 3: 'top', 4: 'dig', 5: 'loops', 6: 'bottom'}[e.key];
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
  off.az -= (e.clientX - drag.x) * 0.3;
  off.el = clamp(off.el + (e.clientY - drag.y) * 0.2, -10, 80);
  drag = {x: e.clientX, y: e.clientY};
  lastInput = T;
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('drag');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  takeOver();
  off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.2);
}, {passive: false});

// ---------------------------------------------------------------- gráfico
const chart = $('chart');
const cx = chart.getContext('2d');
function drawChart(zTr) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (chart.width !== 286 * dpr) {
    chart.width = 286 * dpr;
    chart.height = 170 * dpr;
    chart.style.width = '286px';
    chart.style.height = '170px';
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, 286, 170);
  const X = (z) => 28 + (z / D.H) * 244;
  const YT = (t) => 148 - ((t - 80) / 100) * 128;
  const YK = (k) => 148 - (k / 160) * 128;
  cx.font = "600 9px 'JetBrains Mono',monospace";
  for (const q of ZONES) {
    cx.fillStyle = q.c + '22';
    cx.fillRect(X(q.a), 20, X(q.b) - X(q.a), 128);
    cx.fillStyle = q.c;
    cx.fillText(q.id === 'imp' ? 'IMP' : q.id === 'cc' ? 'CO-CORR' : q.id === 'mcc' ? 'CONTRA' : 'LAVAGEM', X(q.a) + 3, 30);
  }
  cx.strokeStyle = '#eadfcd';
  cx.fillStyle = '#8c7f6d';
  for (const t of [100, 140, 180]) {
    cx.beginPath();
    cx.moveTo(28, YT(t));
    cx.lineTo(272, YT(t));
    cx.stroke();
    cx.fillText(`${t}`, 2, YT(t) + 3);
  }
  cx.fillText('profundidade (m)', 100, 168);
  cx.fillStyle = '#6a4a2a';
  for (const k of [0, 80, 160]) cx.fillText(`κ${k}`, 274 - 18, YK(k) + (k === 160 ? 10 : -2));
  for (const z of [0, 12, 24, 36, 48]) cx.fillText(`${z}`, X(z) - 4, 158);
  cx.lineWidth = 1.8;
  cx.strokeStyle = C.hot;
  cx.beginPath();
  for (let i = 0; i < NP; i++) {
    const z = (i / (NP - 1)) * D.H;
    if (i === 0) cx.moveTo(X(z), YT(M.T[i]));
    else cx.lineTo(X(z), YT(M.T[i]));
  }
  cx.stroke();
  cx.strokeStyle = '#6a4a2a';
  cx.beginPath();
  for (let i = 0; i < NP; i++) {
    const z = (i / (NP - 1)) * D.H;
    if (i === 0) cx.moveTo(X(z), YK(M.K[i]));
    else cx.lineTo(X(z), YK(M.K[i]));
  }
  cx.stroke();
  const i = idx(zTr);
  cx.strokeStyle = '#e3262a';
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(X(zTr), 20);
  cx.lineTo(X(zTr), 148);
  cx.stroke();
  cx.fillStyle = '#e3262a';
  cx.beginPath();
  cx.arc(X(zTr), YT(M.T[i]), 4, 0, Math.PI * 2);
  cx.fill();
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
$('cap-t').textContent = TOUR[0].text;

let lastKey = '';
const colorAttr = colGeo.attributes.color;
const colPosY = colGeo.attributes.position;
function refreshProfile() {
  M = model(P, Tc);
  // cor da coluna por profundidade
  for (let i = 0; i < colPosY.count; i++) {
    const y = colPosY.getY(i); // -H/2 .. H/2
    const z = D.H / 2 - y;
    const c = kColor(M.K[idx(z)]);
    colorAttr.setXYZ(i, c[0], c[1], c[2]);
  }
  colorAttr.needsUpdate = true;
}
refreshProfile();

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
      setToggle('solid', s.solid);
      setToggle('section', s.section);
      $('cap-t').textContent = s.text;
    }
  } else if (T - lastInput > 25) startTour();

  const key = `${P}|${Tc}`;
  if (key !== lastKey) {
    lastKey = key;
    refreshProfile();
  }
  const step = paused ? 0 : dt;
  sDisp += (M.v / 3600) * accel * step; // m de coluna
  const flowK = (P / 1000) * step;

  // casca: sólida, transparente ou cortada
  shellMat.opacity = tog.solid ? 0.96 : 0.22;
  shellMat.depthWrite = tog.solid;
  const clip = tog.section ? [clipPlane] : [];
  for (const m of shellMats) m.clippingPlanes = clip;
  const inside = !tog.solid || tog.section;
  chipPts.visible = inside;
  wPts.visible = inside;
  colMat.opacity = tog.solid && !tog.section ? 0 : 0.55;

  // cavacos na coluna
  const posA = chipGeo.attributes.position.array;
  const colA = chipGeo.attributes.color.array;
  for (let i = 0; i < NC; i++) {
    const q = chipSeeds[i];
    const z = (q.d0 + sDisp) % D.H;
    posA[i * 3] = q.x;
    posA[i * 3 + 1] = D.y1 - z;
    posA[i * 3 + 2] = q.z;
    const c = kColor(M.K[idx(z)]);
    colA[i * 3] = c[0] * 0.8;
    colA[i * 3 + 1] = c[1] * 0.8;
    colA[i * 3 + 2] = c[2] * 0.8;
  }
  chipGeo.attributes.position.needsUpdate = true;
  chipGeo.attributes.color.needsUpdate = true;
  // licor de lavagem (sobe da base até a tela inferior)
  for (let i = 0; i < NW; i++) {
    const q = wSeeds[i];
    q.u = (q.u + step * 0.05 * (P / 1000)) % 1;
    wPos[i * 3] = q.x;
    wPos[i * 3 + 1] = D.y0 + 1 + q.u * 13; // sobe até a tela inferior
    wPos[i * 3 + 2] = q.z;
  }
  wGeo.attributes.position.needsUpdate = true;
  // rastreador
  const zTr = sDisp % D.H;
  tracer.position.set(0, D.y1 - zTr, 1.2);
  tracerRing.position.copy(tracer.position);
  tracer.visible = tracerRing.visible = inside;
  // fluxos
  for (const st of streams) updateStream(st, step, P / 1000 * 1);
  scraper.rotation.y += step * 1.3;
  screw.rotation.y += step * 4;

  // câmera
  const tv = VIEWS[view];
  const k = 1 - Math.exp(-dt / 0.5);
  cam.az += wrap(tv.az + off.az - cam.az) * k;
  cam.el += (clamp(tv.el + off.el, -10, 80) - cam.el) * k;
  cam.d += (tv.d * off.k - cam.d) * k;
  cam.tx += (tv.tx - cam.tx) * k;
  cam.ty += (tv.ty - cam.ty) * k;
  const az = (cam.az * Math.PI) / 180;
  const el = (cam.el * Math.PI) / 180;
  target.set(cam.tx, cam.ty, 0);
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(cam.d).add(target);
  camera.lookAt(target);
  renderer.render(scene, camera);

  labels.forEach((l, i) => {
    v3.set(...l.p).project(camera);
    const d = labEls[i];
    const show = l.groups.includes(tv.groups) && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    d.style.display = show ? 'block' : 'none';
    if (show) {
      d.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`;
      d.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
    }
  });

  // painéis
  const iTr = idx(zTr);
  const zn = zoneAt(zTr);
  $('v-p').textContent = `${P} ADT/d`;
  $('v-t').textContent = `${Tc} °C`;
  $('v-a').textContent = `×${accel}`;
  $('k-p').innerHTML = `${P}<small> ADT/d</small>`;
  $('k-t').innerHTML = `${Tc}<small> °C</small>`;
  $('k-res').innerHTML = `${M.res.toFixed(1)}<small> h</small>`;
  $('k-v').innerHTML = `${M.v.toFixed(1)}<small> m/h</small>`;
  $('k-h').textContent = `${Math.round(M.Hend)}`;
  $('k-k').textContent = `${M.kEnd.toFixed(0)}`;
  $('k-w').innerHTML = `${M.wood.toFixed(0)}<small> odt/h</small>`;
  $('k-wl').innerHTML = `${M.qWL.toFixed(0)}<small> m³/h</small>`;
  $('tr-z').innerHTML = `<span class="dot" style="background:${zn.c}"></span>${zn.name}`;
  $('tr-d').textContent = `${zTr.toFixed(1)} m`;
  $('tr-t').textContent = `${M.T[iTr].toFixed(0)} °C`;
  $('tr-s').textContent = `${((zTr / D.H) * M.res).toFixed(1)} h`;
  $('tr-h').textContent = `${M.Hc[iTr].toFixed(0)}`;
  $('tr-k').textContent = `${M.K[iTr].toFixed(0)}`;
  drawChart(zTr);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.DIG = {model, D, ZONES};
