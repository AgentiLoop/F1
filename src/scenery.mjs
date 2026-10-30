// What grows around each real circuit (circuits.mjs keys), for world3d's
// buildCircuitWorld: the ground's colours (grass, dry grass, bare soil on
// steep ground) and how many tree clusters and of which kinds (weights).
// Chosen by hand from each venue's setting (e.g. the Ardennes forest at Spa,
// the dunes at Zandvoort, palms at Jeddah and Monaco). The RISE Motordrome
// has its own vegetation and lake (savanna.mjs).
const GREEN = { grass: 0x4f7d33, dry: 0x8c8a4a, soil: 0x6e5a3f };
const LUSH = { grass: 0x3f7a2c, dry: 0x6f8a3c, soil: 0x6a4a32 };
const DRY = { grass: 0x7d8040, dry: 0xa39257, soil: 0x8a6a45 };
const DESERT = { grass: 0xc2a477, dry: 0xd4b98a, soil: 0xa9845a };
const DUNES = { grass: 0x8f9a5a, dry: 0xd2c08e, soil: 0xc8b07c };

// water: the real lakes, ponds, rivers and basins around the circuit
// (water.mjs), and sea: the real sea beside it, if any (coast.mjs: the North
// Sea at Zandvoort, the Red Sea at Jeddah, the Mediterranean and Port
// Hercule at Monaco, the Gulf round Yas Island, the Gulf of Bahrain), both
// from OpenStreetMap and in the same polygon form, and buildings: the real
// buildings within 500 m of the road (buildings.mjs, also OpenStreetMap:
// grandstands, pit buildings, Monte Carlo's apartment blocks), and terrain:
// the real ground around it (terrain.mjs, the Mapzen/AWS Terrain Tiles:
// Spa's Ardennes valleys, the Styrian hills round the Red Bull Ring, the
// Maritime Alps above Monaco), and woods: the real woods, single trees and
// tree rows around it (woods.mjs, OpenStreetMap: the Ardennes forest at Spa,
// the royal park at Monza), added to every entry below. Where OSM maps few
// trees, clusters random clusters of trees of these kinds are added.
import { WATER } from './water.mjs';
import { WOODS } from './woods.mjs';
import { COAST } from './coast.mjs';
import { BUILDINGS } from './buildings.mjs';
import { TERRAIN } from './terrain.mjs';

export const DEFAULT_SCENERY = Object.freeze({ ground: GREEN, clusters: 300, trees: { conifer: 0.45, broadleaf: 0.55, palm: 0 }, sea: null, buildings: null, water: null, terrain: null, woods: null });

export const SCENERY = Object.freeze(Object.fromEntries(Object.entries({
  'bahrain': { ground: DESERT, clusters: 60, trees: { conifer: 0, broadleaf: 0, palm: 1 } },
  'shanghai': { ground: GREEN, clusters: 220, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 } },
  'catalunya': { ground: DRY, clusters: 260, trees: { conifer: 0.6, broadleaf: 0.4, palm: 0 } },
  'monaco': { ground: DRY, clusters: 90, trees: { conifer: 0.2, broadleaf: 0.4, palm: 0.4 } },
  'montreal': { ground: GREEN, clusters: 360, trees: { conifer: 0.25, broadleaf: 0.75, palm: 0 } },
  'red-bull-ring': { ground: LUSH, clusters: 420, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 } },
  'silverstone': { ground: GREEN, clusters: 260, trees: { conifer: 0.1, broadleaf: 0.9, palm: 0 } },
  'hungaroring': { ground: DRY, clusters: 240, trees: { conifer: 0.2, broadleaf: 0.8, palm: 0 } },
  'spa': { ground: LUSH, clusters: 600, trees: { conifer: 0.8, broadleaf: 0.2, palm: 0 } },
  'monza': { ground: LUSH, clusters: 560, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 } },
  'cota': { ground: DRY, clusters: 140, trees: { conifer: 0, broadleaf: 1, palm: 0 } },
  'mexico': { ground: DRY, clusters: 200, trees: { conifer: 0.2, broadleaf: 0.6, palm: 0.2 } },
  'interlagos': { ground: LUSH, clusters: 320, trees: { conifer: 0, broadleaf: 0.75, palm: 0.25 } },
  'yas-marina': { ground: DESERT, clusters: 90, trees: { conifer: 0, broadleaf: 0, palm: 1 } },
  'imola': { ground: LUSH, clusters: 420, trees: { conifer: 0.35, broadleaf: 0.65, palm: 0 } },
  'zandvoort': { ground: DUNES, clusters: 120, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 } },
  'jeddah': { ground: DESERT, clusters: 80, trees: { conifer: 0, broadleaf: 0, palm: 1 } },
  'miami': { ground: GREEN, clusters: 160, trees: { conifer: 0, broadleaf: 0.3, palm: 0.7 } },
}).map(([key, s]) => [key, Object.freeze({ ...s, water: WATER[key]?.length ? WATER[key] : null, sea: COAST[key] ?? null, buildings: BUILDINGS[key]?.length ? BUILDINGS[key] : null, terrain: TERRAIN[key] ?? null, woods: WOODS[key] && (WOODS[key].woods.length || WOODS[key].trees.length) ? WOODS[key] : null })])));


// Water polygons (water.mjs form) prepared for the terrain: each as rings
// of [x, y] with its bounding box, and sd(x, y, reach), the signed distance
// (m) from (x, y) to the nearest shore, negative on the water, or Infinity
// when no water is within `reach` m. sdOf(poly, x, y) is the same for one polygon.
export function waterField(polys) {
  const list = (polys ?? []).map(p => {
    const rings = p.map(r => Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i], r[2 * i + 1]]));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { rings, box: [x0, y0, x1, y1] };
  });
  const sdOf = (p, x, y) => {
    let d2 = Infinity, wet = false;
    for (const r of p.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j], [bx, by] = r[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      d2 = Math.min(d2, (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2);
      if ((ay > y) !== (by > y) && x < dx * (y - ay) / (by - ay) + ax) wet = !wet;
    }
    return wet ? -Math.sqrt(d2) : Math.sqrt(d2);
  };
  const sd = (x, y, reach = 60) => {
    let best = Infinity;
    for (const p of list) {
      const [x0, y0, x1, y1] = p.box;
      if (x < x0 - reach || x > x1 + reach || y < y0 - reach || y > y1 + reach) continue;
      best = Math.min(best, sdOf(p, x, y));
    }
    return best;
  };
  return { list, sd, sdOf };
}

// A terrain.mjs grid as the ground height (m) at (x, y), bilinear between
// its points and held at its edge beyond them.
export function terrainField({ x0, y0, step, nx, ny, h }) {
  const bin = atob(h), v = new Float32Array(nx * ny);
  for (let k = 0; k < v.length; k++) { const u = bin.charCodeAt(2 * k) | bin.charCodeAt(2 * k + 1) << 8; v[k] = (u << 16 >> 16) / 10; }
  return (x, y) => {
    const u = Math.min(nx - 1.001, Math.max(0, (x - x0) / step)), w = Math.min(ny - 1.001, Math.max(0, (y - y0) / step)), i = Math.floor(u), j = Math.floor(w), a = u - i, b = w - j, k = j * nx + i;
    return (v[k] * (1 - a) + v[k + 1] * a) * (1 - b) + (v[k + nx] * (1 - a) + v[k + nx + 1] * a) * b;
  };
}
