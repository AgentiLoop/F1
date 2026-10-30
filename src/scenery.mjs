// What grows around each real circuit (circuits.mjs keys), for world3d's
// buildCircuitWorld: the ground's colours (grass, dry grass, bare soil on
// steep ground), how many tree clusters and of which kinds (weights), and,
// where a circuit lies on the coast, the compass bearing (degrees, 0 north,
// 90 east) of the open water from the circuit. Chosen by hand from each
// venue's setting (e.g. the Ardennes forest at Spa, the dunes and North Sea
// at Zandvoort, the Red Sea at Jeddah, the Mediterranean at Monaco). The
// RISE Motordrome has its own vegetation and lake (savanna.mjs).
const GREEN = { grass: 0x4f7d33, dry: 0x8c8a4a, soil: 0x6e5a3f };
const LUSH = { grass: 0x3f7a2c, dry: 0x6f8a3c, soil: 0x6a4a32 };
const DRY = { grass: 0x7d8040, dry: 0xa39257, soil: 0x8a6a45 };
const DESERT = { grass: 0xc2a477, dry: 0xd4b98a, soil: 0xa9845a };
const DUNES = { grass: 0x8f9a5a, dry: 0xd2c08e, soil: 0xc8b07c };

export const DEFAULT_SCENERY = Object.freeze({ ground: GREEN, clusters: 300, trees: { conifer: 0.45, broadleaf: 0.55, palm: 0 }, sea: null });

export const SCENERY = Object.freeze({
  'bahrain': { ground: DESERT, clusters: 60, trees: { conifer: 0, broadleaf: 0, palm: 1 }, sea: null },
  'shanghai': { ground: GREEN, clusters: 220, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 }, sea: null },
  'catalunya': { ground: DRY, clusters: 260, trees: { conifer: 0.6, broadleaf: 0.4, palm: 0 }, sea: null },
  'monaco': { ground: DRY, clusters: 200, trees: { conifer: 0.2, broadleaf: 0.4, palm: 0.4 }, sea: 135 },
  'montreal': { ground: GREEN, clusters: 360, trees: { conifer: 0.25, broadleaf: 0.75, palm: 0 }, sea: null },
  'red-bull-ring': { ground: LUSH, clusters: 420, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 }, sea: null },
  'silverstone': { ground: GREEN, clusters: 260, trees: { conifer: 0.1, broadleaf: 0.9, palm: 0 }, sea: null },
  'hungaroring': { ground: DRY, clusters: 240, trees: { conifer: 0.2, broadleaf: 0.8, palm: 0 }, sea: null },
  'spa': { ground: LUSH, clusters: 600, trees: { conifer: 0.8, broadleaf: 0.2, palm: 0 }, sea: null },
  'monza': { ground: LUSH, clusters: 560, trees: { conifer: 0.15, broadleaf: 0.85, palm: 0 }, sea: null },
  'cota': { ground: DRY, clusters: 140, trees: { conifer: 0, broadleaf: 1, palm: 0 }, sea: null },
  'mexico': { ground: DRY, clusters: 200, trees: { conifer: 0.2, broadleaf: 0.6, palm: 0.2 }, sea: null },
  'interlagos': { ground: LUSH, clusters: 320, trees: { conifer: 0, broadleaf: 0.75, palm: 0.25 }, sea: null },
  'yas-marina': { ground: DESERT, clusters: 90, trees: { conifer: 0, broadleaf: 0, palm: 1 }, sea: null },
  'imola': { ground: LUSH, clusters: 420, trees: { conifer: 0.35, broadleaf: 0.65, palm: 0 }, sea: null },
  'zandvoort': { ground: DUNES, clusters: 120, trees: { conifer: 0.85, broadleaf: 0.15, palm: 0 }, sea: 270 },
  'jeddah': { ground: DESERT, clusters: 80, trees: { conifer: 0, broadleaf: 0, palm: 1 }, sea: 270 },
  'miami': { ground: GREEN, clusters: 160, trees: { conifer: 0, broadleaf: 0.3, palm: 0.7 }, sea: null },
});

// The coast for a sea at compass bearing `bearing` from a circuit whose
// centreline is points [[x, y], ...] (east/north m): dir is the unit vector
// out to sea, and the shore is the line dir·p = shore, `clear` m beyond the
// circuit's furthest point that way. seaSide(x, y) is how far (m) (x, y) is
// out to sea from the shore (negative inland).
export function coast(points, bearing, clear = 160) {
  const a = bearing * Math.PI / 180, dir = [Math.sin(a), Math.cos(a)];
  let far = -Infinity;
  for (const [x, y] of points) far = Math.max(far, x * dir[0] + y * dir[1]);
  const shore = far + clear;
  return { dir, shore, seaSide: (x, y) => x * dir[0] + y * dir[1] - shore };
}
