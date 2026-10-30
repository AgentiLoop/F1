// Adds (or refreshes) `banks` on the real circuits whose corners are really
// banked, in src/circuits.mjs. The OpenF1 car positions cannot measure it
// (the cars' lines through a corner spread less than a metre or two, too
// little to see a cross-slope in their heights), so the banking is the
// published design angle: Zandvoort's Turn 3 (Hugenholtz, 19 degrees) and
// Turn 14 (Arie Luyendyk, 18 degrees) from the Dromo design, and Jeddah's
// Turn 13 (12 degrees). Each corner is given by where it runs (m from the
// timing line, found from the circuit's curvature); the bank rises to
// tan(angle) over RAMP m at either end, raised on the outside of the corner.
// Elsewhere the road is flat across.
//   node tools/import_banking.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';

const BANKED = {
  zandvoort: [{ name: 'Turn 3 Hugenholtz', from: 740, to: 880, degrees: 19 }, { name: 'Turn 14 Arie Luyendyk', from: 3600, to: 3840, degrees: 18 }],
  jeddah: [{ name: 'Turn 13', from: 2320, to: 2500, degrees: 12 }],
};
const RAMP = 40;

const file = new URL('../src/circuits.mjs', import.meta.url);
let text = readFileSync(file, 'utf8');
for (const [key, corners] of Object.entries(BANKED)) {
  const c = CIRCUITS[key], m = c.points.length / 2, track = createCircuitTrack({ ...c, banks: null, pitLane: false });
  const cum = [0];
  for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; cum.push(cum[k] + Math.hypot(c.points[2 * k1] - c.points[2 * k], c.points[2 * k1 + 1] - c.points[2 * k + 1])); }
  // Lap progress on the built track (m) of a distance from the timing line.
  const toTrack = d => ((c.timingLine + d) * track.length / c.length) % track.length;
  const banks = new Array(m).fill(0);
  for (const { name, from, to, degrees } of corners) {
    let turn = 0;
    for (let d = from; d <= to; d += 2) turn += track.curvatureAt(toTrack(d)) * 2;
    // Height gained per metre to the left: a right-hand corner raises its left (outside) edge.
    const b = -Math.sign(turn) * Math.tan(degrees * Math.PI / 180);
    for (let k = 0; k < m; k++) {
      let d = cum[k] / cum[m] * c.length - c.timingLine; d = ((d % c.length) + c.length) % c.length;
      const into = Math.min(d - (from - RAMP), (to + RAMP) - d) / RAMP;
      if (into > 0) banks[k] = Math.round(b * (into >= 1 ? 1 : (1 - Math.cos(Math.PI * into)) / 2) * 1000) / 1000;
    }
    console.log(`${key} ${name}: ${(turn * 180 / Math.PI).toFixed(0)} degrees of turn, bank ${b.toFixed(3)} (${degrees} degrees)`);
  }
  const re = new RegExp(`(  '${key}': \\{[^\\n]*\\n    heights: [^\\n]*\\n)(?:    banks: [^\\n]*\\n)?(    points: )`);
  if (!re.test(text)) throw new Error(`${key}: entry not found`);
  text = text.replace(re, `$1    banks: [${banks.join(',')}],\n$2`);
}
writeFileSync(file, text);
