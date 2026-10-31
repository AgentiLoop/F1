// Writes each circuit's scenery data (scenery_all.mjs sceneryData: its share
// of water.mjs, coast.mjs, buildings.mjs, terrain.mjs, woods.mjs,
// landcover.mjs, roads.mjs, barriers.mjs, bridges.mjs and tunnels.mjs) to
// src/tracks/<key>.json, the file the page fetches for that circuit alone
// (scenery.mjs loadScenery). Run after any of the import_*.mjs tools that
// write those files: node tools/split_scenery.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENERY_STYLE } from '../src/scenery.mjs';
import { sceneryData } from '../src/scenery_all.mjs';

const dir = new URL('../src/tracks/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const key of Object.keys(SCENERY_STYLE)) {
  const text = JSON.stringify(sceneryData(key));
  writeFileSync(new URL(`${key}.json`, dir), text);
  console.log(key, `${(text.length / 1024).toFixed(0)} KB`);
}
