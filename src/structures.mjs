// Structures around the RISE Motordrome, after the rest of the RISE sim's
// js/scenery.js: two footbridges over the road (after the last hairpin and on
// the crest before Turn 8) with our banner on both faces, floodlight masts
// every 34 m on alternating sides, the paddock's 64 m cone tower with a helical
// rib, white tensile domes and thatched huts on the terraces behind the pits,
// villages of small houses with tin or tile roofs out in the farmland, and the
// trackside furniture: braking boards, corner numbers and marshal posts.
// Our own WebGL code (instanced meshes and canvas textures instead of the sim's
// WebGPU node shaders). Our lap starts on that sim's start line (80.1 m into
// its lap) and shares its world x / z, so its places carry over directly.
// Physics (x, y) maps to world (x, h, -y); offsets are + to the right.
import * as THREE from '../vendor/three.module.js';

const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const RISE_START = 80.1, DECK = 7.5, MAST = 24;
// The sim's corners (number, metres into its lap, direction; its
// js/track-data.js) and the seven it puts braking boards before.
const RISE_CORNERS = [[1, 607.7, 'L'], [2, 824.3, 'R'], [3, 1375.2, 'R'], [4, 1514, 'L'], [5, 1707.4, 'R'], [6, 1816.7, 'L'],
  [7, 2071.2, 'L'], [8, 3160.4, 'L'], [9, 3547.2, 'R'], [10, 3932, 'L'], [11, 4110.7, 'L'], [12, 4365.2, 'R'], [13, 4640, 'R'],
  [14, 4825, 'L'], [15, 4925, 'R'], [16, 5095, 'L'], [17, 5695.9, 'L']].map(([n, s, dir]) => ({ n, s, dir }));
const HEAVY = [1, 3, 4, 8, 12, 14, 17];

// Where everything goes. terrain: { height(x, y), dist(x, y), lake(x, y) }.
// Returns { bridges: [{ s, yaw, half, x, y, h }], masts: [{ x, y, yaw }],
// tower: { x, y }, domes / huts: [{ x, y, r }], houses: [{ x, y, yaw, w, l, tint, roof }],
// boards / cornerSigns: [{ s, x, y, yaw, n }], posts: [{ s, x, y, yaw }], clear(x, y) }: clear is false where a tree would stand in one of them.
export function structuresPlan(track, terrain) {
  const wallAt = track.wallOffset, half = track.roadWidth / 2, pit = track.pit, lake = track.lakeLevel;
  const signed = s => { s = ((s % track.length) + track.length) % track.length; return s > track.length / 2 ? s - track.length : s; };
  const offRoad = (x, y, m) => Math.abs(track.offset(x, y)) > m;
  const dry = (x, y) => lake === null || terrain.height(x, y) > lake + 0.8;
  // Footbridges: piers just outside the barriers, deck 7.5 m over the road's centre.
  const bridges = [[-135, 0.18], [2760 - RISE_START, -0.1]].map(([s, yaw]) => {
    const [x, y] = track.point(s);
    return { s, yaw, half: (wallAt + 3) / Math.cos(yaw), x, y, h: track.elevation(s) + DECK };
  });
  // Floodlight masts 4.5 m behind the barrier, alternating sides, none along
  // the pit lane, the start straight's stands and pit building, under a bridge,
  // near another part of the circuit or in the lake.
  const masts = [];
  for (let s = 0, k = 0; s < track.length; s += 34, k++) {
    const side = k % 2 ? -1 : 1, o = side * (wallAt + 4.5), ss = signed(s);
    if (ss > -260 && ss < 260) continue;
    if (pit && Math.sign(o) === -pit.side && ss > pit.entry - 20 && ss < pit.exit + 20) continue;
    if (bridges.some(b => Math.abs(signed(s - b.s)) < 20)) continue;
    const [x, y] = track.point(s, o);
    if (!offRoad(x, y, wallAt + 3) || !dry(x, y)) continue;
    const h = track.heading(s);
    masts.push({ x, y, yaw: Math.atan2(-side * Math.sin(h), -side * Math.cos(h)) });
  }
  // Paddock behind the pit building (pits are on the left, offset < 0).
  const pd = pit ? -pit.side : -1;
  const [tx, ty] = track.point(70, pd * (half + 100));
  const tower = { x: tx, y: ty };
  const domes = [], huts = [], rand = mulberry(42);
  for (let k = 0; k < 46; k++) {
    const s = -200 + rand() * 470, d = half + 52 + rand() * 135, rr = rand(), size = rand();
    const [x, y] = track.point(s, pd * d);
    if (Math.hypot(x - tx, y - ty) < 22 || !offRoad(x, y, wallAt + 16) || !dry(x, y)) continue;
    if ([...domes, ...huts].some(o => Math.hypot(o.x - x, o.y - y) < o.r + 9)) continue;
    if (rr < 0.55) domes.push({ x, y, r: 5 + size * 6 }); else huts.push({ x, y, r: 3 + size * 2.5 });
  }
  // Villages: clusters of 4-21 houses 650-1700 m out, 220 m or more from the
  // road and 60 m or more from the lake.
  const houses = [], vr = mulberry(314);
  for (let c = 0; c < 70; c++) {
    const a = vr() * Math.PI * 2, r = 650 + vr() * 1050, cx = Math.cos(a) * r + 150, cy = -Math.sin(a) * r;
    const n = 4 + Math.floor(vr() * 18), axis = vr() * Math.PI;
    if (terrain.dist(cx, cy) < 260 || (terrain.lake && terrain.lake(cx, cy) < 80)) continue;
    for (let k = 0; k < n; k++) {
      const along = (vr() - 0.5) * 160, across = (vr() - 0.5) * 50;
      const x = cx + Math.cos(axis) * along - Math.sin(axis) * across, y = cy - (Math.sin(axis) * along + Math.cos(axis) * across);
      const yaw = axis + (vr() < 0.5 ? 0 : Math.PI / 2) + (vr() - 0.5) * 0.3, w = 5 + vr() * 4, l = 7 + vr() * 6, tint = vr(), roof = vr();
      if (terrain.dist(x, y) < 220 || (terrain.lake && terrain.lake(x, y) < 60)) continue;
      if (houses.some(o => Math.hypot(o.x - x, o.y - y) < 13)) continue;
      houses.push({ x, y, yaw, w, l, tint, roof });
    }
  }
  // Trackside furniture, all facing the approaching cars (yaw turns a board's
  // front, local +z, against the race direction): braking boards 3, 2 and 1
  // hundred metres before the heavy-braking corners, on the run-off outside
  // the approach; a yellow corner number just behind the outside barrier 25 m
  // before every corner; orange marshal posts every 330 m behind the barrier
  // on the outside of the bend, away from the pit lane and the start straight.
  const facing = s => track.heading(s) - Math.PI / 2;
  const outside = c => c.dir === 'L' ? 1 : -1;
  const boards = [], cornerSigns = [], posts = [];
  for (const c of RISE_CORNERS) {
    if (HEAVY.includes(c.n)) for (const n of [3, 2, 1]) {
      const s = c.s - RISE_START - 70 - n * 100, [x, y] = track.point(s, outside(c) * (half + 3.5));
      boards.push({ s, x, y, yaw: facing(s), n });
    }
    const s = c.s - RISE_START - 25, [x, y] = track.point(s, outside(c) * (wallAt + 1.5));
    if (offRoad(x, y, wallAt + 0.5) && dry(x, y)) cornerSigns.push({ s, x, y, yaw: facing(s), n: c.n });
  }
  for (let s = 120 - RISE_START; s < track.length; s += 330) {
    const turn = track.heading(s + 5) - track.heading(s - 5), ss = signed(s);
    let side = Math.sin(turn) > 0 ? 1 : -1;
    if (pit && side === -pit.side && ss > pit.entry - 20 && ss < pit.exit + 20) side = -side;
    if (ss > -260 && ss < 260) continue;
    const [x, y] = track.point(s, side * (wallAt + 2.2));
    if (offRoad(x, y, wallAt + 1) && dry(x, y)) posts.push({ s, x, y, yaw: facing(s) });
  }
  const round = [{ ...tower, r: 13 }, ...domes, ...huts].map(o => ({ x: o.x, y: o.y, r: o.r + 4 }));
  const clear = (x, y) => !round.some(o => Math.hypot(x - o.x, y - o.y) < o.r) && !houses.some(o => Math.hypot(x - o.x, y - o.y) < 10);
  return { bridges, masts, tower, domes, huts, houses, boards, cornerSigns, posts, clear };
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// The cone's skin: white with grey ribs winding six times round it, one turn
// every 9 m of height (u around, v up the 64 m lathe).
function towerTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#eeeee6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c7ccd1';
    const turns = 64 / 9;
    for (let k = -8; k <= 6; k++) {
      const u = (c, v) => (k + c - turns * v) / 6 * w;
      g.beginPath(); g.moveTo(u(0.03, 0), h); g.lineTo(u(0.21, 0), h); g.lineTo(u(0.21, 1), 0); g.lineTo(u(0.03, 1), 0); g.closePath(); g.fill();
    }
  });
}

function thatchTexture() {
  const rnd = mulberry(5);
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#6b4d26'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { const k = rnd(); g.fillStyle = `rgba(${k < 0.5 ? '40,26,10' : '150,118,64'},0.35)`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd(), 6 + rnd() * 14); }
  });
}

// Adds the structures in `plan` to world. ground(x, y) is the terrain height;
// bannerMat is the branding on the footbridges.
export function buildStructures(world, track, plan, { ground, bannerMat = null }) {
  const group = new THREE.Group(); group.name = 'rise-structures'; world.add(group);
  const std = o => new THREE.MeshStandardMaterial(o);
  const shade = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const instanced = (geo, mat, list, place, colour) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => { place(o); im.setMatrixAt(i, m4.compose(v, q, sc)); if (colour) im.setColorAt(i, colour(o)); });
    group.add(shade(im)); return im;
  };

  // Footbridges: deck along local x across the road, piers down to the ground.
  const concrete = std({ color: 0xcfcac0, roughness: 0.8 }), steel = std({ color: 0x2b3036, roughness: 0.4, metalness: 0.7 });
  for (const b of plan.bridges) {
    const h = track.heading(b.s), g = new THREE.Group(), span = 2 * b.half + 8;
    g.name = 'footbridge'; g.position.set(b.x, b.h, -b.y); g.rotation.y = h - Math.PI / 2 + b.yaw; group.add(g);
    // local x = right of the race direction, z = against it
    g.add(shade(new THREE.Mesh(new THREE.BoxGeometry(span, 0.9, 7), concrete)));
    for (const z of [3.4, -3.4]) { const rail = shade(new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.12), steel)); rail.position.set(0, 1, z); g.add(rail); }
    for (const side of [-1, 1]) {
      g.updateMatrixWorld(true);
      const p = g.localToWorld(v.set(side * b.half, 0, 0)), drop = b.h - ground(p.x, -p.z) + 1.5;
      const pier = shade(new THREE.Mesh(new THREE.BoxGeometry(2.2, drop, 4), concrete)); pier.position.set(side * b.half, -0.4 - drop / 2, 0); g.add(pier);
    }
    if (bannerMat) for (const z of [3.56, -3.56]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(36, 4.5), bannerMat);
      banner.position.set(0, 0.8, z); banner.rotation.y = z > 0 ? 0 : Math.PI; g.add(banner);
    }
  }

  // Floodlight masts, the lamp head facing the road.
  const mastGeo = new THREE.CylinderGeometry(0.16, 0.32, MAST + 1, 6); mastGeo.translate(0, (MAST + 1) / 2 - 1, 0);
  const headGeo = new THREE.BoxGeometry(3.2, 1.2, 0.5); headGeo.translate(0, MAST + 0.4, 0.4);
  const lampFace = std({ color: 0xe8ecef, roughness: 0.3, emissive: 0xfff6e0, emissiveIntensity: 0.15, name: 'floodlight-lamp' }), headMat = std({ color: 0x30343a, roughness: 0.4, metalness: 0.5 });
  const atMast = o => { v.set(o.x, ground(o.x, o.y) - 0.3, -o.y); q.setFromAxisAngle(up, o.yaw); sc.set(1, 1, 1); };
  const masts = instanced(mastGeo, std({ color: 0x8a9096, roughness: 0.5, metalness: 0.7 }), plan.masts, atMast);
  instanced(headGeo, [headMat, headMat, headMat, headMat, lampFace, headMat], plan.masts, atMast);
  if (masts) masts.name = 'floodlights';

  // Paddock: the cone tower and its pavilions.
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector2(11 * Math.pow(1 - t, 1.35) + 1.3, t * 64)); }
  pts.push(new THREE.Vector2(0.01, 64.6));
  const tower = shade(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), std({ map: towerTexture(), roughness: 0.35, metalness: 0.1 })));
  tower.name = 'paddock-tower'; tower.position.set(plan.tower.x, ground(plan.tower.x, plan.tower.y) - 0.5, -plan.tower.y); group.add(tower);
  q.identity();
  const dome = std({ color: 0xf4f2ec, roughness: 0.7, side: THREE.DoubleSide });
  instanced(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome, plan.domes,
    o => { v.set(o.x, ground(o.x, o.y) - 0.3, -o.y); sc.set(o.r, o.r * 0.55, o.r); });
  instanced(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), std({ color: 0xc9b38f, roughness: 0.9, side: THREE.DoubleSide }), plan.huts,
    o => { v.set(o.x, ground(o.x, o.y) + 0.8, -o.y); sc.set(o.r, 3.2, o.r); });
  instanced(new THREE.ConeGeometry(1, 1, 24, 1, true), std({ map: thatchTexture(), roughness: 1, side: THREE.DoubleSide }), plan.huts,
    o => { v.set(o.x, ground(o.x, o.y) + 2.4 + o.r * 0.55, -o.y); sc.set(o.r * 1.25, o.r * 1.1, o.r * 1.25); });

  // Villages: plastered or brick walls (some painted blue), tin or tile roofs.
  const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  const prism = new THREE.Shape(); prism.moveTo(-0.58, 0); prism.lineTo(0.58, 0); prism.lineTo(0, 0.42); prism.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(prism, { depth: 1.08, bevelEnabled: false }); roofGeo.translate(0, 0, -0.54);
  const plaster = new THREE.Color(0xc7b89e), brick = new THREE.Color(0x8c6b4d), blue = new THREE.Color(0x9ebdcc), tin = new THREE.Color(0x8c8f94), tile = new THREE.Color(0x732919);
  const walls = instanced(wallGeo, std({ roughness: 0.9 }), plan.houses,
    o => { v.set(o.x, ground(o.x, o.y) - 2, -o.y); q.setFromAxisAngle(up, o.yaw); sc.set(o.w, 4.8, o.l); },
    o => o.tint > 0.85 ? blue : o.tint > 0.55 ? brick : plaster);
  instanced(roofGeo, std({ roughness: 0.45, metalness: 0.5 }), plan.houses,
    o => { v.set(o.x, ground(o.x, o.y) + 2.8, -o.y); q.setFromAxisAngle(up, o.yaw); sc.set(o.w, o.w * 0.9, o.l); },
    o => o.roof > 0.6 ? tile : tin);
  if (walls) walls.name = 'village-houses';

  // Trackside furniture. Boards stand on the run-off (the road's own surface,
  // track.heightAt); the rest stand behind the barrier on whichever is higher.
  const onGround = (x, y) => Math.max(track.heightAt(x, y), ground(x, y));
  const numberMat = (text, bg) => std({ roughness: 0.6, map: canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#111';
    g.font = '700 92px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 70);
  }) });
  const back = std({ color: 0xd8d8d4, roughness: 0.7 }), legSteel = std({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.7 });
  const faced = face => [back, back, back, back, face, back];
  const at = (o, y) => { v.set(o.x, y, -o.y); q.setFromAxisAngle(up, o.yaw); sc.set(1, 1, 1); };
  // Braking boards 1.1 x 1.45 m on two legs, 0.35 m off the run-off.
  const boardGeo = new THREE.BoxGeometry(1.1, 1.45, 0.08); boardGeo.translate(0, 0.35 + 0.725, 0);
  const legGeo = new THREE.BoxGeometry(0.07, 2.2, 0.07); legGeo.translate(0, 0.7, -0.075);
  const onRoad = o => at(o, track.heightAt(o.x, o.y));
  for (const n of [3, 2, 1]) { const im = instanced(boardGeo, faced(numberMat(String(n), '#f4f4f0')), plan.boards.filter(o => o.n === n), onRoad); if (im) im.name = 'braking-board-' + n; }
  for (const dx of [-0.38, 0.38]) instanced(legGeo.clone().translate(dx, 0, 0), legSteel, plan.boards, onRoad);
  // Corner numbers: 2.2 m yellow squares on a post, clear of the wall boards.
  const signGeo = new THREE.BoxGeometry(2.2, 2.2, 0.12); signGeo.translate(0, 2.9 + 1.1, 0);
  for (const o of plan.cornerSigns) { at(o, onGround(o.x, o.y)); const sign = shade(new THREE.Mesh(signGeo, faced(numberMat(String(o.n), '#fad201')))); sign.name = 'corner-' + o.n; sign.position.copy(v); sign.quaternion.copy(q); group.add(sign); }
  const postGeo = new THREE.BoxGeometry(0.14, 5.16, 0.14); postGeo.translate(0, 2.08, -0.13);
  instanced(postGeo, legSteel, plan.cornerSigns, o => at(o, onGround(o.x, o.y)));
  // Marshal posts: 2.2 m huts, orange below and white above 1.6 m.
  const hutGeo = (y0, y1) => { const g = new THREE.BoxGeometry(2.2, y1 - y0, 2.2); g.translate(0, (y0 + y1) / 2, 0); return g; };
  const atPost = o => at(o, onGround(o.x, o.y) - 0.2);
  const marshal = instanced(hutGeo(-0.6, 1.6), std({ color: 0xf26b0d, roughness: 0.7 }), plan.posts, atPost);
  instanced(hutGeo(1.6, 2.6), std({ color: 0xebebe6, roughness: 0.7 }), plan.posts, atPost);
  if (marshal) marshal.name = 'marshal-posts';
  return { bridges: plan.bridges.length, masts: plan.masts.length, domes: plan.domes.length, huts: plan.huts.length, houses: plan.houses.length,
    boards: plan.boards.length, cornerSigns: plan.cornerSigns.length, posts: plan.posts.length };
}
