// Every circuit's scenery at once (scenery.mjs sceneryOf), from the data
// files that hold all circuits, for the tests and tools. The page loads only
// the circuit it drives (scenery.mjs loadScenery, src/tracks/<key>.json,
// written from sceneryData by tools/split_scenery.mjs).
import { WATER } from './water.mjs';
import { WOODS } from './woods.mjs';
import { COAST } from './coast.mjs';
import { BUILDINGS, STANDS } from './buildings.mjs';
import { TERRAIN } from './terrain.mjs';
import { LANDCOVER } from './landcover.mjs';
import { ROADS } from './roads.mjs';
import { BARRIERS } from './barriers.mjs';
import { BRIDGES } from './bridges.mjs';
import { TUNNELS } from './tunnels.mjs';
import { SCENERY_STYLE, sceneryOf } from './scenery.mjs';

export const sceneryData = key => ({ water: WATER[key], sea: COAST[key], buildings: BUILDINGS[key], stands: STANDS[key], terrain: TERRAIN[key], woods: WOODS[key], landcover: LANDCOVER[key], roads: ROADS[key], barriers: BARRIERS[key], bridges: BRIDGES[key], tunnels: TUNNELS[key] });

export const SCENERY = Object.freeze(Object.fromEntries(Object.keys(SCENERY_STYLE).map(key => [key, sceneryOf(key, sceneryData(key))])));
