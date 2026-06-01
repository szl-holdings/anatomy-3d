// SZL Anatomy 3D V2 — HUMAN-shaped substrate, organs INSIDE the body,
// live 6-flagship status + TubeGeometry wires with animated traveling particles.
// Three.js r160 via esm.sh ES modules. Doctrine v11. ZERO BANDAID — honest states.
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
// SZL canonical mobile layer (additive — desktop OrbitControls untouched).
import { SZLMobileControls } from './static/szl-mobile-controls.js';
const SZL_MOBILE = SZLMobileControls.isMobileDevice();
const SZL_REDUCED = SZLMobileControls.prefersReducedMotion();

const FALLBACK_DATE = '2026-06-01';
const A11OY = 'https://szlholdings-a11oy.hf.space';

// ---- Live flagship polling config (per founder directive) — 6 flagships ----
const FLAGSHIPS = [
  { name: 'a11oy',     url: 'https://szlholdings-a11oy.hf.space',     healthEndpoint: '/api/a11oy/healthz' },
  { name: 'amaru',     url: 'https://szlholdings-amaru.hf.space',     healthEndpoint: '/api/amaru/healthz' },
  { name: 'sentra',    url: 'https://szlholdings-sentra.hf.space',    healthEndpoint: '/api/sentra/healthz' },
  { name: 'vessels',   url: 'https://szlholdings-vessels.hf.space',   healthEndpoint: '/api/vessels/healthz' },
  { name: 'killinchu', url: 'https://szlholdings-killinchu.hf.space', healthEndpoint: '/api/killinchu/healthz' },
  { name: 'rosie',     url: 'https://szlholdings-rosie.hf.space',     healthEndpoint: '/' }
];
const NFLAG = FLAGSHIPS.length;

let scene, camera, renderer, composer, controls, raycaster, pointer;
let organs = {};          // id -> { group, home:Vector3, normal:Vector3, data }
let wireObjects = {};      // id -> { tube, particles[], curve, data }
let bodyGroup;
let satellites = {};       // flagship name -> { group, orb, halo, label, data, alive }
let satWires = [];         // wires from satellites into body organs (TubeGeometry + particles)
let DATA = null;
let exploded = false, pulseMode = false, showBody = true, showFlags = true;
let clock = new THREE.Clock();
let selected = null;
let liveStatus = { lambda: false, honest: false };
let lambdaAxes = [];
let lastFpsTime = performance.now(), frameCount = 0, fps = 60;

const STATUS_COLORS = { PROVEN: '#33dd88', PARTIAL: '#ffcc33', SORRY: '#ff8833', AXIOM: '#88aaff', CONJECTURE: '#ff5577', PENDING: '#888', LIVE: '#33dd88' };
const BODY_CENTER = new THREE.Vector3(0, 6, 0);

// shared geometry for traveling particles (1 sphere geo reused -> fewer allocations)
const PARTICLE_GEO = new THREE.SphereGeometry(0.16, 10, 8);
const PARTICLES_PER_WIRE = 5;

init();

async function init() {
  const canvasWrap = document.getElementById('scene');
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060d');
  scene.fog = new THREE.FogExp2('#05060d', 0.010);

  camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, 42);

  const SZL_H = SZLMobileControls.rendererHints();
  renderer = new THREE.WebGLRenderer({ antialias: SZL_H.antialias, powerPreference: SZL_H.powerPreference });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(SZL_MOBILE ? SZL_H.pixelRatio : Math.min(window.devicePixelRatio, 1.8));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  canvasWrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x335577, 0.42));
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(8, 18, 14); scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.55); fill.position.set(-14, 6, 10); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff5577, 0.4); rim.position.set(0, -8, -16); scene.add(rim);
  scene.add(new THREE.PointLight(0x66ccff, 0.7, 80));

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom for glow (leader #9): strength, radius, threshold tuned for sci-fi medical.
  // On mobile, lighten bloom strength to keep the fragment cost low on iOS GPUs.
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), SZL_MOBILE ? 0.55 : 0.9, 0.55, 0.18);
  composer.addPass(bloom);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.minDistance = 8; controls.maxDistance = 120;
  controls.target.copy(BODY_CENTER);
  if(SZL_MOBILE){ controls.rotateSpeed=0.6; controls.zoomSpeed=0.8; controls.enablePan=true; }

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < Math.round(1400*SZLMobileControls.particleScale()); i++) starPos.push((Math.random()-0.5)*260,(Math.random()-0.5)*260,(Math.random()-0.5)*260);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x3355aa, size: 0.35, transparent: true, opacity: 0.6 })));

  try {
    const res = await fetch('assets/organs.json');
    DATA = await res.json();
  } catch(e) { console.error('organ data load failed', e); }
  lambdaAxes = DATA.lambdaAxes || [];

  buildHumanBody();
  buildOrgans();
  buildWires();
  buildSatellites();
  buildUI();

  renderer.domElement.addEventListener('pointerdown', onPick);
  window.addEventListener('resize', onResize);

  await refreshLiveData();
  setInterval(refreshLiveData, 30000);
  pollFlagships();
  setInterval(pollFlagships, 30000);
  setInterval(updateClock, 1000); updateClock();

  animate();
}

// ============================================================
// PHASE 1 — HUMAN-SHAPED BODY (semi-transparent skin over organs)
// subsurface-scatter approximation: translucent shell, organs visible inside
// ============================================================
function skinMat(opacity) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#a9cdf2'),
    emissive: new THREE.Color('#16294a'),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: opacity ?? 0.16,
    transmission: 0.55,          // SSS approx — light passes through, organs glow inside
    thickness: 1.2,
    roughness: 0.55,
    metalness: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function addPart(geo, mat, x, y, z, rot) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0]||0, rot[1]||0, rot[2]||0);
  bodyGroup.add(m);
  return m;
}

function buildHumanBody() {
  bodyGroup = new THREE.Group();
  const mat = skinMat(0.16);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x7fb8ff, wireframe: true, transparent: true, opacity: 0.11 });
  const S = 4.5; // scene scale: spec head y=2.5 -> scene y=11.25

  // HEAD r=0.4 @ y=2.5 ; NECK ; TORSO ; SHOULDERS ; HIPS ; ARMS ; LEGS
  addPart(new THREE.SphereGeometry(0.4*S, 28, 22), mat, 0, 2.5*S, 0);
  addPart(new THREE.CylinderGeometry(0.15*S, 0.18*S, 0.35*S, 18), mat, 0, 2.12*S, 0);
  const torso = addPart(new THREE.CylinderGeometry(0.62*S, 0.46*S, 1.55*S, 28, 1), mat, 0, 1.28*S, 0);
  torso.scale.set(1.0, 1.0, 0.62);
  const chest = addPart(new THREE.SphereGeometry(0.6*S, 24, 18), mat, 0, 1.78*S, 0);
  chest.scale.set(1.0, 0.7, 0.6);
  addPart(new THREE.SphereGeometry(0.26*S, 18, 14), mat, -0.7*S, 2.0*S, 0);
  addPart(new THREE.SphereGeometry(0.26*S, 18, 14), mat,  0.7*S, 2.0*S, 0);
  const hips = addPart(new THREE.CylinderGeometry(0.5*S, 0.42*S, 0.5*S, 24), mat, 0, 0.45*S, 0);
  hips.scale.set(1.0, 1.0, 0.62);

  function arm(sx) {
    const ua = addPart(new THREE.CylinderGeometry(0.13*S, 0.12*S, 0.78*S, 14), mat, sx*0.82*S, 1.62*S, 0);
    ua.rotation.z = sx * 0.13;
    addPart(new THREE.SphereGeometry(0.12*S, 12, 10), mat, sx*0.92*S, 1.18*S, 0);
    const fa = addPart(new THREE.CylinderGeometry(0.11*S, 0.09*S, 0.78*S, 14), mat, sx*1.0*S, 0.74*S, 0);
    fa.rotation.z = sx * 0.06;
    const hand = addPart(new THREE.SphereGeometry(0.13*S, 12, 10), mat, sx*1.03*S, 0.34*S, 0);
    hand.scale.set(0.7, 1.1, 0.5);
  }
  arm(-1); arm(1);

  function leg(sx) {
    addPart(new THREE.CylinderGeometry(0.18*S, 0.15*S, 0.9*S, 16), mat, sx*0.22*S, -0.1*S, 0);
    addPart(new THREE.SphereGeometry(0.15*S, 12, 10), mat, sx*0.22*S, -0.6*S, 0);
    addPart(new THREE.CylinderGeometry(0.14*S, 0.1*S, 0.95*S, 16), mat, sx*0.22*S, -1.12*S, 0);
    addPart(new THREE.BoxGeometry(0.18*S, 0.12*S, 0.42*S), mat, sx*0.22*S, -1.62*S, 0.12*S);
  }
  leg(-1); leg(1);

  const wf = new THREE.Mesh(new THREE.CylinderGeometry(0.64*S, 0.48*S, 1.55*S, 16, 3), wireMat);
  wf.position.set(0, 1.28*S, 0); wf.scale.set(1.0, 1.0, 0.62);
  bodyGroup.add(wf);
  scene.add(bodyGroup);
}

// ============================================================
// ORGANS — anatomically placed INSIDE the human body
// ============================================================
function organLayout() {
  return {
    amaru:   { pos: [0, 11.0, 0],   build: buildAmaru },
    yuyay:   { pos: [0, 7.6, 0.4],  build: buildYuyay },
    unay:    { pos: [0, 7.0, -0.9], build: buildUnay },
    yawar:   { pos: [0, 6.0, 0],    build: buildYawar },
    huklla:  { pos: [0, 8.3, 0.5],  build: buildHuklla },
    kallpa:  { pos: [0, 6.0, 0],    build: buildKallpa },
    khipu:   { pos: [0, 5.2, -0.7], build: buildKhipu },
    lambda:  { pos: [0, 6.0, -1.0], build: buildLambda },
    otel:    { pos: [0, 8.0, -1.0], build: buildOtel },
    kanchay: { pos: [0, 6.0, 0],    build: buildKanchay },
    hatun:   { pos: [0, 6.0, 0],    build: buildHatun },
    sumaq:   { pos: [0, 6.0, 0],    build: buildSumaq },
    // Doctrine v13 EDGE ORGANS (ADDITIVE 2026-06-01, Yachay). Anatomical landmarks:
    // CHASKI at the eyes/face, WALLPA at the mouth/throat, WASI-RIKUQ atop the head.
    // LOCKED preserved (749/14/163). Each is a [0,1] PURIQ factor (PuriqFormulaLean §9, sorry).
    "chaski":     { pos: [0, 11.5, 1.6], build: buildChaski },
    "wallpa":     { pos: [0, 10.3, 1.5], build: buildWallpa },
    "wasi-rikuq": { pos: [0, 13.6, 0.0], build: buildWasiRikuq },
  };
}

function mkMat(d, opts={}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(d.color),
    emissive: new THREE.Color(d.emissive || '#000000'),
    emissiveIntensity: d.glow ? 1.2 : 0.35,    // >1 triggers bloom for glowing organs
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.45,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    wireframe: opts.wireframe ?? false,
    side: opts.side ?? THREE.FrontSide,
    toneMapped: d.glow ? false : true,
  });
}

function buildOrgans() {
  const layout = organLayout();
  DATA.organs.forEach(d => {
    const lo = layout[d.id];
    if (!lo) return;
    const group = new THREE.Group();
    const home = new THREE.Vector3(...lo.pos);
    group.position.copy(home);
    lo.build(group, d);
    group.userData = { id: d.id, data: d };
    let normal = home.clone().sub(BODY_CENTER);
    if (normal.length() < 0.4) normal.set((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5));
    normal.normalize();
    scene.add(group);
    organs[d.id] = { group, home, normal, data: d };
  });
}

function buildAmaru(g, d) {
  const brain = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 3), mkMat(d, { roughness: 0.6 }));
  const pos = brain.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = 0.22 * Math.sin(v.x*5) * Math.cos(v.y*5) * Math.sin(v.z*4);
    v.multiplyScalar(1 + n); pos.setXYZ(i, v.x, v.y, v.z);
  }
  brain.geometry.computeVertexNormals();
  g.add(brain);
  const serpent = new THREE.Mesh(new THREE.TorusKnotGeometry(1.15, 0.06, 120, 10, 2, 3), mkMat(d, { metalness: 0.6, roughness: 0.3 }));
  g.add(serpent); g.userData.spin = serpent;
}
function buildYuyay(g, d) {
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 22), mkMat(d, { roughness: 0.45 }));
  heart.scale.set(1, 1.2, 0.9); g.add(heart);
  // gold 13-axis ring + 13 vertebra markers around the heart (visible)
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 1.0, metalness: 0.7, roughness: 0.25, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 8, 64), goldMat);
  ring.rotation.x = Math.PI/2.4; g.add(ring);
  const markers = [];
  for (let i = 0; i < 13; i++) {
    const a = (i/13) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), goldMat.clone());
    m.position.set(Math.cos(a)*1.25, Math.sin(a)*1.25*0.42, Math.sin(a)*0.5);
    g.add(m); markers.push(m);
  }
  g.userData.pulse = heart; g.userData.markers = markers;
}
function buildUnay(g, d) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 18), mkMat(d, { transparent: true, opacity: 0.55 }));
  g.add(m);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 64), mkMat(d, { wireframe: true }));
  ring.rotation.x = Math.PI/2; g.add(ring);
}
function buildYawar(g, d) {
  // YAWAR circulatory: red TubeGeometry veins through torso + arms + legs (leader #19)
  const grp = new THREE.Group();
  const paths = [
    [[0,-1.8,0],[0.6,0.5,0.3],[-0.5,2.5,0.3],[0,3.6,0]],
    [[0,-1.8,0],[-0.6,0.5,-0.3],[0.5,2.5,-0.3],[0,3.6,0]],
    [[0.6,2.6,0],[1.6*0.82,0.4,0],[1.9,-1.2,0]],
    [[-0.6,2.6,0],[-1.6*0.82,0.4,0],[-1.9,-1.2,0]],
    [[0.4,-1.8,0],[1.0,-3.2,0],[1.0,-6.5,0]],
    [[-0.4,-1.8,0],[-1.0,-3.2,0],[-1.0,-6.5,0]],
  ];
  grp.userData.flowCurves = [];
  paths.forEach(pp => {
    const curve = new THREE.CatmullRomCurve3(pp.map(p=>new THREE.Vector3(...p)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 8, false), mkMat(d, { metalness: 0.2, roughness: 0.4 }));
    grp.add(tube);
    grp.userData.flowCurves.push(curve);
  });
  // blood cells flowing along veins
  const cellMat = new THREE.MeshBasicMaterial({ color: 0xff4455, toneMapped: false });
  const cells = [];
  grp.userData.flowCurves.forEach(curve => {
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), cellMat);
      c.userData = { curve, t: Math.random() };
      grp.add(c); cells.push(c);
    }
  });
  g.add(grp); g.userData.pulse = grp; g.userData.cells = cells;
}
function buildHuklla(g, d) {
  const dodeca = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mkMat(d, { transparent: true, opacity: 0.45, metalness: 0.2, roughness: 0.5 }));
  g.add(dodeca);
  const cage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.78, 0), mkMat(d, { wireframe: true, transparent: true, opacity: 0.7 }));
  g.add(cage); g.userData.spin = cage;
}
function buildKallpa(g, d) {
  const hub = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mkMat(d, { metalness: 0.7, roughness: 0.2 }));
  g.add(hub); g.userData.spin = hub;
}
function buildKhipu(g, d) {
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.12, 100, 10, 2, 3), mkMat(d, { metalness: 0.5, roughness: 0.3 }));
  g.add(knot);
  for (let i = 0; i < 3; i++) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), mkMat(d, { roughness: 0.7 }));
    cord.position.set((i-1)*0.4, -1.0, 0); g.add(cord);
    const k = new THREE.Mesh(new THREE.TorusKnotGeometry(0.08, 0.03, 40, 6, 2, 3), mkMat(d, { metalness: 0.5 }));
    k.position.set((i-1)*0.4, -1.7, 0); g.add(k);
  }
  g.userData.spin = knot;
}
function buildLambda(g, d) {
  const VERTEBRAE_COUNT = 13; // honesty constraint: exactly 13
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.6, 10), mkMat(d, { metalness: 0.8, roughness: 0.2 }));
  col.position.y = 0; g.add(col);
  g.userData.vertebrae = [];
  const axisClasses = ['sacred','sacred','structural','structural','structural','structural','structural','structural','structural','introspection','introspection','introspection','introspection'];
  const classColors = { sacred: '#ffd700', structural: '#c0c8d8', introspection: '#ff5577' };
  const topY = 3.6, botY = -3.6;
  for (let i = 0; i < VERTEBRAE_COUNT; i++) {
    const y = topY - (i/(VERTEBRAE_COUNT-1)) * (topY - botY);
    const cls = axisClasses[i];
    const clr = classColors[cls];
    const vert = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.08, 10, 24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(clr), emissive: new THREE.Color(clr), emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25, toneMapped: false })
    );
    vert.rotation.x = Math.PI/2; vert.position.y = y;
    vert.userData.axisIndex = i; vert.userData.axisClass = cls;
    g.add(vert); g.userData.vertebrae.push(vert);
  }
}
function buildOtel(g, d) {
  const grp = new THREE.Group();
  function branch(start, dir, len, depth) {
    if (depth <= 0) return;
    const end = start.clone().add(dir.clone().multiplyScalar(len));
    const curve = new THREE.LineCurve3(start, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.02 + depth*0.008, 5, false), mkMat(d, { roughness: 0.5 }));
    grp.add(tube);
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mkMat(d, { metalness: 0.4 }));
    node.position.copy(end); grp.add(node);
    for (let i = 0; i < 2; i++) {
      const nd = dir.clone().applyAxisAngle(new THREE.Vector3(Math.random(),Math.random(),Math.random()).normalize(), (Math.random()-0.5)*1.4).normalize();
      branch(end, nd, len*0.7, depth-1);
    }
  }
  branch(new THREE.Vector3(0,1.5,0), new THREE.Vector3(0.4,-1,0.1).normalize(), 0.9, 4);
  branch(new THREE.Vector3(0,1.5,0), new THREE.Vector3(-0.4,-1,0.1).normalize(), 0.9, 4);
  g.add(grp); g.userData.spin = grp;
}
function buildKanchay(g, d) {
  const halo = new THREE.Mesh(new THREE.SphereGeometry(8.0, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color), transparent: true, opacity: 0.05, side: THREE.BackSide }));
  halo.scale.set(0.8, 1.25, 0.8); g.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.1, 12, 96), mkMat(d, { metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI/2; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.05, 8, 96), mkMat(d, { transparent: true, opacity: 0.35 }));
  ring2.rotation.x = Math.PI/2.2; g.add(ring2);
  g.userData.spin = g;
}
function buildHatun(g, d) {
  const sph = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 18), mkMat(d, { wireframe: true, transparent: true, opacity: 0.13 }));
  sph.scale.set(0.8, 1.25, 0.8); g.add(sph); g.userData.spin = sph;
}
function buildSumaq(g, d) {
  const n = 220, pos = [];
  for (let i = 0; i < n; i++) {
    const r = 5 + Math.random()*5;
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    pos.push(r*Math.sin(ph)*Math.cos(th), (Math.random()-0.5)*16, r*Math.sin(ph)*Math.sin(th)*0.7);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(d.color), size: 0.18, transparent: true, opacity: 0.55 }));
  g.add(pts); g.userData.spin = pts;
}

// ------------------------------------------------------------
// Doctrine v13 EDGE ORGAN build functions (ADDITIVE, Yachay 2026-06-01).
// CHASKI = cyan eye-pair (reception/face), WALLPA = purple voice-capsule
// (mouth/throat), WASI-RIKUQ = gold watchful eye atop the head. No existing
// organ is touched. v13 factors are [0,1] gates (PuriqFormulaLean §9, sorry).
// ------------------------------------------------------------
function buildChaski(g, d) {
  // Two cyan eyes at the face — reception / first-touch.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 18), mkMat(d, { roughness: 0.3 }));
    eye.position.set(sx * 0.55, 0.18, 0.0); g.add(eye);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x06303a, emissive: 0x0a8fb0, emissiveIntensity: 0.6, toneMapped: false }));
    iris.position.set(sx * 0.55, 0.18, 0.28); g.add(iris);
  }
  // Relay arc linking the two eyes (the messenger's path).
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 48, Math.PI), mkMat(d, { metalness: 0.5, roughness: 0.3 }));
  arc.rotation.z = Math.PI; arc.position.y = 0.18; g.add(arc);
  g.userData.spin = arc;
}
function buildWallpa(g, d) {
  // Purple voice-capsule at mouth/throat with stacked resonance rings (sound).
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 8, 18), mkMat(d, { roughness: 0.4 }));
  g.add(capsule); g.userData.pulse = capsule;
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.28, 0.03, 8, 48), mkMat(d, { metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.6 - i * 0.15 }));
    r.rotation.x = Math.PI / 2; r.position.z = 0.2 + i * 0.18; g.add(r); rings.push(r);
  }
  g.userData.markers = rings;
}
function buildWasiRikuq(g, d) {
  // Gold watchful eye atop the head — advisory single-pane observability.
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.46, 26, 20), mkMat(d, { roughness: 0.35 }));
  sclera.scale.set(1.0, 0.7, 1.0); g.add(sclera); g.userData.pulse = sclera;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a1c00, emissive: 0xffcb3d, emissiveIntensity: 0.8, toneMapped: false }));
  pupil.position.y = 0.18; g.add(pupil);
  // Watch-ring (the house-watcher's gaze sweep).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.045, 8, 64), mkMat(d, { metalness: 0.6, roughness: 0.25 }));
  ring.rotation.x = Math.PI / 2.2; g.add(ring); g.userData.spin = ring;
}

// ============================================================
// WIRES — TubeGeometry curves with animated traveling sphere particles.
// LIVE -> colored solid tube + flowing spheres. PENDING -> gray DASHED, no flow.
// ============================================================
function makeWireTube(curve, colorHex, live) {
  const grp = new THREE.Group();
  if (live) {
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 64, 0.055, 8, false),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), emissive: new THREE.Color(colorHex), emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.3, transparent: true, opacity: 0.85, toneMapped: false })
    );
    grp.add(tube);
  } else {
    // PENDING -> gray DASHED line (honest), thin, no glow
    const pts = curve.getPoints(60);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.55, dashSize: 0.45, gapSize: 0.32 }));
    line.computeLineDistances();
    grp.add(line);
  }
  // traveling particles (only on LIVE wires)
  const particles = [];
  if (live) {
    const pmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), toneMapped: false });
    for (let k = 0; k < PARTICLES_PER_WIRE; k++) {
      const p = new THREE.Mesh(PARTICLE_GEO, pmat);
      p.userData = { t: k / PARTICLES_PER_WIRE };
      grp.add(p); particles.push(p);
    }
  }
  return { grp, particles };
}

function buildWires() {
  if (!DATA.wires) return;
  DATA.wires.forEach(w => {
    const a = organs[w.from], b = organs[w.to];
    if (!a || !b) return;
    const start = a.home.clone(), end = b.home.clone();
    const mid = start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3((Math.random()-0.5)*1.5, 1.0, (Math.random()-0.5)*1.5));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const live = w.status === 'LIVE';
    const { grp, particles } = makeWireTube(curve, w.color || '#33dd88', live);
    grp.userData = { wire: w.id };
    scene.add(grp);
    wireObjects[w.id] = { grp, particles, curve, data: w };
  });
}

// ============================================================
// 6 FLAGSHIP SATELLITE ORBS + TubeGeometry WIRES INTO BODY
// ============================================================
function buildSatellites() {
  if (!DATA.flagships) return;
  const linkMap = DATA.flagshipOrganLink || {};
  DATA.flagships.forEach(f => {
    const grp = new THREE.Group();
    grp.position.set(...f.pos);
    const col = new THREE.Color(f.color);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.0, metalness: 0.5, roughness: 0.3, toneMapped: false }));
    grp.add(orb);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, toneMapped: false }));
    grp.add(halo);
    const label = makeLabel(f.name, f.role);
    label.position.set(0, 2.0, 0);
    grp.add(label);
    scene.add(grp);
    satellites[f.name] = { group: grp, orb, halo, label, data: f, alive: null };

    const linkOrgan = organs[linkMap[f.name]];
    if (linkOrgan) {
      const startV = new THREE.Vector3(...f.pos);
      const endV = linkOrgan.home.clone();
      const midV = startV.clone().add(endV).multiplyScalar(0.5).add(new THREE.Vector3(0, 2, 1));
      const curve = new THREE.QuadraticBezierCurve3(startV, midV, endV);
      // built as LIVE-style tube; recolored/dimmed by poll status (gray dashed look via opacity)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, 0.05, 8, false),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.0, metalness: 0.3, roughness: 0.3, transparent: true, opacity: 0.5, toneMapped: false })
      );
      scene.add(tube);
      const particles = [];
      const pmat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
      for (let k = 0; k < PARTICLES_PER_WIRE; k++) {
        const p = new THREE.Mesh(PARTICLE_GEO, pmat.clone());
        p.userData = { t: k / PARTICLES_PER_WIRE };
        scene.add(p); particles.push(p);
      }
      satWires.push({ name: f.name, tube, particles, curve, col, alive: null });
    }
  });
}

function makeLabel(text, sub) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,24,0.72)';
  roundRect(ctx, 4, 4, 248, 72, 12); ctx.fill();
  ctx.font = 'bold 36px Inter, sans-serif'; ctx.fillStyle = '#eaf2ff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 30);
  if (sub) { ctx.font = '18px Inter, sans-serif'; ctx.fillStyle = '#9fb6d8'; ctx.fillText(sub, 128, 58); }
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(3.6, 1.1, 1);
  return spr;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}

// ============================================================
// LIVE FLAGSHIP POLLING (every 30s)
// ============================================================
async function pollFlagships() {
  for (const flag of FLAGSHIPS) {
    try {
      const r = await fetch(flag.url + flag.healthEndpoint, { mode: 'cors', signal: AbortSignal.timeout(6000) });
      flag.alive = r.ok;
      flag.lastPoll = Date.now();
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j) {
        if (j.sha || j.commit) flag.sha = String(j.sha || j.commit).substring(0, 8);
        if (j.version) flag.version = j.version;
        if (typeof j.lambda === 'number') flag.lambda = j.lambda;
      }
    } catch { flag.alive = false; flag.lastPoll = Date.now(); }
    if (flag.lambda === undefined) {
      try {
        const lr = await fetch(flag.url + '/v1/lambda', { mode: 'cors', signal: AbortSignal.timeout(4000) });
        if (lr.ok) { const lj = await lr.json().catch(()=>null); if (lj && typeof lj.lambda === 'number') flag.lambda = lj.lambda; }
      } catch {}
    }
  }
  renderFlagshipPanel();
  applyFlagshipVisualStatus();
}

function renderFlagshipPanel() {
  const el = document.getElementById('flagList');
  el.innerHTML = '';
  let up = 0, newest = 0;
  FLAGSHIPS.forEach(f => {
    if (f.alive) up++;
    if (f.lastPoll && f.lastPoll > newest) newest = f.lastPoll;
    const cls = f.alive === true ? 'up' : (f.alive === false ? 'down' : 'unknown');
    const ts = f.lastPoll ? new Date(f.lastPoll).toISOString().substring(11,19) + 'Z' : '—';
    const meta = DATA.flagships.find(x=>x.name===f.name) || {};
    const sha = f.sha ? `<code>${f.sha}</code>` : '<span class="nosha">no sha</span>';
    const lam = (typeof f.lambda === 'number') ? f.lambda.toFixed(3) : '—';
    const card = document.createElement('div');
    card.className = 'flag-card ' + cls;
    card.innerHTML = `<span class="sdot ${cls}"></span>
      <span class="fname" style="color:${meta.color||'#fff'}">${f.name}</span>
      <span class="fmeta">${meta.role||''}<br>${ts} · ${sha}</span>
      <span class="flam">Λ ${lam}</span>`;
    el.appendChild(card);
  });
  const upEl = document.getElementById('hudUp');
  upEl.textContent = `${up}/${NFLAG}`;
  upEl.style.color = up === NFLAG ? '#33dd88' : up >= NFLAG-2 ? '#ffcc33' : '#ff5577';
  document.getElementById('flagPollAge').textContent = newest ? 'polled ' + new Date(newest).toISOString().substring(11,19) + 'Z' : 'polling…';
}

function applyFlagshipVisualStatus() {
  FLAGSHIPS.forEach(f => {
    const s = satellites[f.name]; if (!s) return;
    const up = f.alive === true;
    const c = new THREE.Color(up ? '#33dd88' : (f.alive === false ? '#ff3355' : '#888888'));
    s.orb.material.color.copy(c); s.orb.material.emissive.copy(c);
    s.halo.material.color.copy(c);
    s.alive = f.alive;
    const sw = satWires.find(w => w.name === f.name);
    if (sw) {
      sw.alive = up;
      // DOWN flagship -> dim wire to near-dashed-gray honesty; UP -> bright colored flow
      sw.tube.material.color.copy(c); sw.tube.material.emissive.copy(c);
      sw.tube.material.opacity = up ? 0.65 : 0.12;
      sw.tube.material.emissiveIntensity = up ? 1.2 : 0.15;
      sw.particles.forEach(p => { p.material.color.copy(c); p.visible = up; });
    }
  });
}

// ---------- UI ----------
function buildUI() {
  const wt = document.getElementById('wireToggles');
  DATA.wires.forEach(w => {
    const lbl = document.createElement('label'); lbl.className = 'toggle';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
    cb.onchange = () => setWireVisible(w.id, cb.checked);
    const badge = w.status === 'LIVE' ? '<span class="dot live"></span>' : '<span class="dot pend"></span>';
    lbl.innerHTML = `${badge} Wire ${w.id} <span class="wstat">${w.status==='LIVE'?'live':'pending'}</span>`;
    lbl.prepend(cb); wt.appendChild(lbl);
  });
  document.getElementById('btnExplode').onclick = toggleExplode;
  document.getElementById('btnPulse').onclick = togglePulse;
  document.getElementById('btnReset').onclick = () => { controls.reset(); camera.position.set(0,8,42); };
  document.getElementById('btnBody').onclick = toggleBody;
  document.getElementById('btnFlags').onclick = toggleFlags;
}

function setWireVisible(id, v) { const w = wireObjects[id]; if (w) w.grp.visible = v; }
function toggleExplode() { exploded = !exploded; document.getElementById('btnExplode').textContent = exploded ? 'Reassemble' : 'Explode'; }
function togglePulse() { pulseMode = !pulseMode; document.getElementById('btnPulse').classList.toggle('on', pulseMode); }
function toggleBody() {
  showBody = !showBody; bodyGroup.visible = showBody;
  const b = document.getElementById('btnBody'); b.textContent = showBody ? 'Hide body' : 'Show body'; b.classList.toggle('toggleon', showBody);
}
function toggleFlags() {
  showFlags = !showFlags;
  Object.values(satellites).forEach(s => s.group.visible = showFlags);
  satWires.forEach(w => { w.tube.visible = showFlags; w.particles.forEach(p=>p.visible = showFlags && w.alive === true); });
  const b = document.getElementById('btnFlags'); b.textContent = showFlags ? 'Hide flagships' : 'Show flagships'; b.classList.toggle('toggleon', showFlags);
}

function onPick(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const groups = Object.values(organs).map(o => o.group);
  const hits = raycaster.intersectObjects(groups, true);
  if (hits.length) {
    let obj = hits[0].object;
    while (obj && !obj.userData.id && obj.parent) obj = obj.parent;
    if (obj && obj.userData.id) selectOrgan(obj.userData.id);
  }
}

window.__selectOrgan = (id) => selectOrgan(id);
function selectOrgan(id) {
  selected = id;
  const o = organs[id]; const d = o.data;
  document.querySelectorAll('.organ-li').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  const sc = STATUS_COLORS[d.lean] || '#888';
  const formulas = d.formulas.map(f => `<li><code>${f}</code></li>`).join('');
  // ANATOMY UNIFICATION genome block: Quechua name + PURIQ formula + Lean theorem + receipt count
  const fStat = (d.puriq_primary_status || '').toUpperCase();
  const statCls = fStat.includes('PROVED') ? 'proved' : (fStat.includes('CONJECTURE') ? 'conj' : 'open');
  const statLabel = fStat.includes('PROVED') ? 'PROVED' : (fStat.includes('CONJECTURE') ? 'CONJECTURE 1' : 'OPEN (sorry)');
  const allF = (d.puriq_formulas || []).map(f => `<span class="fpill" style="margin:2px 4px 2px 0">${f}</span>`).join('');
  const genome = `
    <div class="genome">
      <div class="grow">
        <span class="glabel">Quechua organ</span>
        <span class="gval" style="color:${d.color}">${d.quechua}</span>
      </div>
      <div class="grow">
        <span class="glabel">PURIQ formula</span>
        <span class="gval">${d.puriq_primary ? `<span class="fpill">${d.puriq_primary}</span><span class="fstat ${statCls}">${statLabel}</span>` : '<span style="opacity:.55;font-weight:500">no numbered formula</span>'}</span>
      </div>
      ${d.puriq_primary_name ? `<div class="fname">${d.puriq_primary_name}</div>` : ''}
      <div class="grow">
        <span class="glabel">Receipts (live ledger)</span>
        <span class="rcount">${d.receipts ?? 0}<small>${d.receipts_component || ''}</small></span>
      </div>
      ${(d.puriq_formulas && d.puriq_formulas.length > 1) ? `<div class="grow"><span class="glabel">All formulas</span><span class="gval">${allF}</span></div>` : ''}
      ${d.lean_theorem ? `<div class="grow" style="display:block"><span class="glabel">Lean theorem</span><div class="leanref">${d.lean_theorem}</div></div>` : ''}
    </div>`;
  document.getElementById('panel').classList.add('open');
  document.getElementById('panelBody').innerHTML = `
    <div class="org-head" style="border-color:${d.color}">
      <span class="qn" style="color:${d.color}">${d.quechua}</span>
      <span class="en">${d.english}</span>
    </div>
    <div class="rolepos">${d.role||''}</div>
    <div class="badge" style="background:${sc}">Lean: ${d.lean}</div>
    ${genome}
    <p class="note">${d.leanNote}</p>
    <h4>Formula registry (implementation files)</h4>
    <ul class="formulas">${formulas}</ul>
    <h4>Tests</h4>
    <p class="tests">${d.tests}</p>
    ${d.zenodo ? `<p class="zen">Zenodo: <a href="https://doi.org/${d.zenodo}" target="_blank">${d.zenodo}</a></p>` : '<p class="zen warn">No Zenodo deposit (provenance gap)</p>'}
    <a class="demo-btn" href="${d.demo}" target="_blank">Open live demo →</a>
  `;
}

function updateClock() { document.getElementById('hudClock').textContent = new Date().toISOString().substring(11,19) + 'Z'; }

async function refreshLiveData() {
  try {
    const r = await fetch(`${A11OY}/api/a11oy/v1/honest`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const h = await r.json();
      liveStatus.honest = true;
      document.getElementById('hudDecl').textContent = h.declarations ?? 749;
      document.getElementById('hudAxioms').textContent = h.axioms_unique ?? 14;
      document.getElementById('hudSorries').textContent = h.sorries_total ?? 163;
    }
  } catch(e) { liveStatus.honest = false; }
  try {
    const r = await fetch(`${A11OY}/api/a11oy/v1/lambda`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (r.ok && Array.isArray(j.axes)) { lambdaAxes = j.axes; liveStatus.lambda = true; }
    else liveStatus.lambda = false;
  } catch(e) { liveStatus.lambda = false; }

  const FLOOR = 0.7;
  const scores = lambdaAxes.map(a => a.score);
  const lam = scores.length ? Math.pow(scores.reduce((p,s)=>p*Math.max(s,1e-6),1), 1/scores.length) : 0;
  const above = scores.filter(s => s >= FLOOR).length;
  document.getElementById('hudLambda').textContent = lam.toFixed(3);
  document.getElementById('hudAxes').textContent = `${above}/${scores.length}`;

  const banner = document.getElementById('dataBanner');
  if (!liveStatus.lambda) {
    banner.style.display = 'block';
    banner.textContent = `live Λ data unavailable — showing ${FALLBACK_DATE} Doctrine v11 snapshot`;
  } else { banner.style.display = 'none'; }
}

// ---------- animation ----------
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  Object.values(organs).forEach(o => {
    const target = exploded ? o.home.clone().add(o.normal.clone().multiplyScalar(11)) : o.home;
    o.group.position.lerp(target, 0.06);
    if (o.group.userData.spin && !SZL_REDUCED) o.group.userData.spin.rotation.y += 0.004;
  });
  if (organs.amaru && organs.amaru.group.userData.spin) organs.amaru.group.userData.spin.rotation.z += 0.003;

  // YUYAY heartbeat (leader #7) — sharp systole + breathing
  const beatPhase = (t % (60/72)) / (60/72);
  const systole = beatPhase < 0.2 ? Math.sin(beatPhase/0.2*Math.PI) : 0;
  const breathe = (Math.sin(t*0.25)+1)/2;
  const beat = 1 + systole*0.12 + breathe*0.04;
  if (organs.yawar && organs.yawar.group.userData.pulse) {
    organs.yawar.group.userData.pulse.traverse(m => { if (m.material && m.material.emissive) m.material.emissiveIntensity = 0.9 + systole*0.8; });
    // blood cells flow
    (organs.yawar.group.userData.cells||[]).forEach(c => {
      c.userData.t = (c.userData.t + 0.004) % 1;
      const p = c.userData.curve.getPoint(c.userData.t);
      c.position.copy(p);
    });
  }
  if (organs.yuyay && organs.yuyay.group.userData.pulse) {
    organs.yuyay.group.userData.pulse.scale.set(beat, beat*1.2, beat*0.9);
  }

  // Λ-spine vertebrae pulse (13 axes, Doctrine v11)
  if (organs.lambda && organs.lambda.group.userData.vertebrae) {
    organs.lambda.group.userData.vertebrae.forEach((v, i) => {
      const axData = lambdaAxes[i] ? lambdaAxes[i] : { score: 0.88 };
      const score = axData.score;
      const cls = v.userData.axisClass || 'structural';
      if (pulseMode) {
        const freq = cls === 'sacred' ? 4.2 : cls === 'structural' ? 2.8 : 1.9;
        const amp = cls === 'sacred' ? 0.35 : cls === 'structural' ? 0.22 : 0.28;
        const floor = cls === 'sacred' ? 0.95 : cls === 'structural' ? 0.90 : 0.82;
        const aboveFloor = score >= floor;
        const p = 1 + Math.sin(t*freq + i*0.48) * amp * (aboveFloor ? 1 : 0.4);
        v.scale.setScalar(p);
        v.material.emissiveIntensity = 0.6 + score*(0.7 + Math.sin(t*freq + i*0.48)*0.45);
      } else {
        v.scale.setScalar(1);
        v.material.emissiveIntensity = 0.5 + score*0.4;
      }
    });
  }

  // internal wire traveling particles (LIVE only)
  Object.values(wireObjects).forEach(w => {
    if (w.data.status === 'LIVE' && w.grp.visible) {
      w.particles.forEach(p => {
        p.userData.t = (p.userData.t + 0.005) % 1;
        p.position.copy(w.curve.getPoint(p.userData.t));
      });
    }
  });

  // satellite orbs spin; signal particles flow on UP wires
  Object.values(satellites).forEach(s => { s.orb.rotation.y += 0.01; s.halo.rotation.z += 0.012; });
  satWires.forEach(w => {
    if (w.tube.visible && w.alive === true) {
      w.particles.forEach(p => {
        p.userData.t = (p.userData.t + 0.007) % 1;
        p.position.copy(w.curve.getPoint(p.userData.t));
      });
    }
  });

  controls.update();
  if(!document.hidden) composer.render();   // battery saver: skip render when tab/app hidden

  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps = frameCount; frameCount = 0; lastFpsTime = now;
    const el = document.getElementById('hudFps'); if (el) el.textContent = fps;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
