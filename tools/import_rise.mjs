// Adds (or refreshes) the 'rwanda' entry in src/circuits.mjs from the RISE
// Motordrome sim's track data (github.com/mrsmickers/rise-motordrome,
// js/track-data.js: 5 m samples, x east, z south, y altitude, by Simon Smyth).
// The lap is rotated to start on that sim's start line and written every 10 m
// as east/north metres like the other circuits.
// No race telemetry exists for it, so the DRS zones are placed by hand on the
// two longest straights (the main straight and the 1 km back straight, which
// is capped at 900 m).
//   node tools/import_rise.mjs ~/Downloads/rise-motordrome-main/js/track-data.js
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const source = process.argv[2];
if (!source) { console.error('usage: node tools/import_rise.mjs <rise-motordrome>/js/track-data.js'); process.exit(1); }
const { TRACK } = await import(pathToFileURL(source).href);
const n = TRACK.x.length, k0 = Math.round(TRACK.startLine / TRACK.step), every = Math.round(10 / TRACK.step);
const r = v => Math.round(v * 10) / 10, points = [];
for (let j = 0; j < n / every; j++) { const i = (k0 + j * every) % n; points.push(r(TRACK.x[i]), r(-TRACK.z[i])); }
const entry = `  'rwanda': { name: "RISE Motordrome (planned African GP)", location: "Bugesera", length: ${TRACK.length}, timingLine: 0, roadWidth: 15, drs: [[0.961,0.0757],[0.33,0.48]],\n    points: [${points.join(',')}] },\n`;
const file = new URL('../src/circuits.mjs', import.meta.url);
let text = readFileSync(file, 'utf8').replace(/  'rwanda': \{[^\n]*\n[^\n]*\n/, '');
text = text.replace(/\n\}\);\s*$/, `\n${entry}});\n`);
writeFileSync(file, text);
console.log(`rwanda: ${points.length / 2} points, start line at ${TRACK.startLine} m`);
