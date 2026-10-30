// What grows around each real circuit (circuits.mjs keys), for world3d's
// buildCircuitWorld: the ground's colours (grass, dry grass, bare soil on
// steep ground) and how many tree clusters and of which kinds (weights).
// Chosen by hand from each venue's setting (e.g. the Ardennes forest at Spa,
// the dunes at Zandvoort, palms at Jeddah and Monaco). The RISE Motordrome
// has its own vegetation and lake (savanna.mjs).
// buildings, where a town comes up to the circuit: how many blocks, from how
// near (default 4) and out to how far (m) beyond the barriers, and their lowest and highest roofs (m) —
// Monte Carlo's apartment blocks climbing the hill around the streets, the
// neighbourhoods of São Paulo and Mexico City around Interlagos and the
// Autódromo, Jeddah's Corniche and Yas Marina's hotels (also by hand).
const GREEN = { grass: 0x4f7d33, dry: 0x8c8a4a, soil: 0x6e5a3f };
const LUSH = { grass: 0x3f7a2c, dry: 0x6f8a3c, soil: 0x6a4a32 };
const DRY = { grass: 0x7d8040, dry: 0xa39257, soil: 0x8a6a45 };
const DESERT = { grass: 0xc2a477, dry: 0xd4b98a, soil: 0xa9845a };
const DUNES = { grass: 0x8f9a5a, dry: 0xd2c08e, soil: 0xc8b07c };

// water: the real lakes, ponds, rivers and basins around the circuit
// (water.mjs), and sea: the real sea beside it, if any (coast.mjs: the North
// Sea at Zandvoort, the Red Sea at Jeddah, the Mediterranean and Port
// Hercule at Monaco, the Gulf round Yas Island, the Gulf of Bahrain), both
// from OpenStreetMap and in the same polygon form, added to every entry below.
import { WATER } from './water.mjs';
import { COAST } from './coast.mjs';

export const DEFAULT_SCENERY = Object.freeze({ ground: GREEN, clusters: 300, trees: { conifer: 0.45, broadleaf: 0.55, palm: 0 }, sea: null, buildings: null, water: null });

export const SCENERY = Object.freeze(Object.fromEntries(Object.entries({
  'bahrain': { ground: DESERT, clusters: 60, trees: { conifer: 0, broadleaf: 0, palm: 1 }, buildings: null },
  'shanghai': { ground: GREEN, clusters: 220, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 }, buildings: null },
  'catalunya': { ground: DRY, clusters: 260, trees: { conifer: 0.6, broadleaf: 0.4, palm: 0 }, buildings: null },
  'monaco': { ground: DRY, clusters: 90, trees: { conifer: 0.2, broadleaf: 0.4, palm: 0.4 }, buildings: { count: 650, far: 260, low: 12, high: 55 } },
  'montreal': { ground: GREEN, clusters: 360, trees: { conifer: 0.25, broadleaf: 0.75, palm: 0 }, buildings: null },
  'red-bull-ring': { ground: LUSH, clusters: 420, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 }, buildings: null },
  'silverstone': { ground: GREEN, clusters: 260, trees: { conifer: 0.1, broadleaf: 0.9, palm: 0 }, buildings: null },
  'hungaroring': { ground: DRY, clusters: 240, trees: { conifer: 0.2, broadleaf: 0.8, palm: 0 }, buildings: null },
  'spa': { ground: LUSH, clusters: 600, trees: { conifer: 0.8, broadleaf: 0.2, palm: 0 }, buildings: null },
  'monza': { ground: LUSH, clusters: 560, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 }, buildings: null },
  'cota': { ground: DRY, clusters: 140, trees: { conifer: 0, broadleaf: 1, palm: 0 }, buildings: null },
  'mexico': { ground: DRY, clusters: 200, trees: { conifer: 0.2, broadleaf: 0.6, palm: 0.2 }, buildings: { count: 200, near: 150, far: 500, low: 6, high: 25 } },
  'interlagos': { ground: LUSH, clusters: 320, trees: { conifer: 0, broadleaf: 0.75, palm: 0.25 }, buildings: { count: 260, near: 60, far: 450, low: 6, high: 30 } },
  'yas-marina': { ground: DESERT, clusters: 90, trees: { conifer: 0, broadleaf: 0, palm: 1 }, buildings: { count: 40, far: 300, low: 8, high: 32 } },
  'imola': { ground: LUSH, clusters: 420, trees: { conifer: 0.35, broadleaf: 0.65, palm: 0 }, buildings: null },
  'zandvoort': { ground: DUNES, clusters: 120, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 }, buildings: null },
  'jeddah': { ground: DESERT, clusters: 80, trees: { conifer: 0, broadleaf: 0, palm: 1 }, buildings: { count: 60, far: 400, low: 6, high: 22 } },
  'miami': { ground: GREEN, clusters: 160, trees: { conifer: 0, broadleaf: 0.3, palm: 0.7 }, buildings: null },
}).map(([key, s]) => [key, Object.freeze({ ...s, water: WATER[key]?.length ? WATER[key] : null, sea: COAST[key] ?? null })])));


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
