import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRB22Template, buildRB22Car, liveryTexels, LIVERY_SLOTS, SPONSORS } from './rb22.mjs';
import { DEFAULT_CAR } from './physics.mjs';

const bytes = readFileSync(new URL('./models/rb22.glb', import.meta.url));
const template = await loadRB22Template(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

test('every livery slot lands on the bodywork', () => {
  const texels = liveryTexels(template);
  assert.equal(texels.length, LIVERY_SLOTS.length);
  LIVERY_SLOTS.forEach((slot, k) => {
    const { idx, s, t } = texels[k];
    // Coverage of the label rectangle on a 24 x 6 grid.
    const cells = new Set();
    for (let i = 0; i < idx.length; i++) cells.add(Math.floor((s[i] / slot.w + 0.5) * 24) * 6 + Math.floor((t[i] / slot.h + 0.5) * 6));
    assert.ok(cells.size / 144 > 0.8, `slot ${k} (${slot.role}) covers ${(cells.size / 144 * 100).toFixed(0)}%`);
    assert.ok(idx.every(i => i >= 0 && i < 1024 * 1024), `slot ${k} texel range`);
  });
});

test('the sponsor names include the brands and the car builds without a DOM', () => {
  assert.deepEqual(SPONSORS, ['AgentiLoop Racing', 'InkPen.io', 'SuperBox64.com', 'AgentiLoop.si']);
  const { group, wheels } = buildRB22Car(template, DEFAULT_CAR, { paint: 0xc8102e, accent: 0xf4f4f4, index: 1 });
  assert.equal(group.name, 'f1-car');
  assert.equal(wheels.length, 4);
});
