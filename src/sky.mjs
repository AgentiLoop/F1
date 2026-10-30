// Sky dome after the RISE Motordrome sim's js/sky.js "Day · 10:30" preset:
// a Rayleigh-blue zenith fading to a pale, hazy horizon, a sun disc with a
// Mie glow around it and a drifting deck of cumulus (its SkyMesh cloud
// coverage 0.42, density 0.42). Their WebGPU SkyMesh/TSL nodes are re-done
// here as a WebGL shader. The sun sits where the scene's directional light
// shines from, so the disc agrees with the shadows. TIMES holds that sim's
// four times of day (dawn, day, sunset, night race) for setSkyTime.
import * as THREE from '../vendor/three.module.js';

// RISE day preset colours (sunColor 0xfff1dc, fogColor 0xbcd0e2 as the horizon).
export const RISE_DAY = { sunColor: 0xfff1dc, horizon: 0xbcd0e2, zenith: 0x2f6db5, clouds: 0.42, cloudDensity: 0.42 };

// The sim's sun direction from compass azimuth and elevation (degrees); its
// world x / z are ours. Bugesera is 2° south of the equator: the sun rises in
// the east and sets over the lake to the west.
const dirFrom = (az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(); };
// The sim's PRESETS with its light levels scaled to ours (its day sun 5.4 and
// hemisphere 0.62 are our 2.8 and 0.7) and its exponential fog density turned
// into our linear fog's far distance (its day 0.00006 is our 1700 m). "day"
// keeps this game's own lighting, so the default look is unchanged.
// sun: direction towards it; sky: the dome's horizon, zenith, clouds and
// cloud density; night: 1 hides the sun disc, shows the stars and lights the
// floodlights.
export const TIMES = {
  dawn: { label: 'Dawn · 06:30', sun: dirFrom(103, 6.5), sunColor: 0xffb46e, sunIntensity: 1.35, hemiSky: 0x9fb8d8, hemiGround: 0x5a4a32, hemi: 0.68, env: 0.5,
    fogColor: 0xd9c3ae, fogFar: 1360, exposure: 1.05, sky: { horizon: 0xe3b48c, zenith: 0x5f82b8, clouds: 0.38, cloudDensity: 0.32 }, night: 0 },
  day: { label: 'Day · 10:30', sun: new THREE.Vector3(35, 70, 25).normalize(), sunColor: 0xfff0d8, sunIntensity: 2.8, hemiSky: 0xd6e8ff, hemiGround: 0x4a5a32, hemi: 0.7, env: 0.55,
    fogColor: 0xc8d8e4, fogFar: 1700, exposure: 1.05, sky: { horizon: RISE_DAY.horizon, zenith: RISE_DAY.zenith, clouds: RISE_DAY.clouds, cloudDensity: RISE_DAY.cloudDensity }, night: 0 },
  sunset: { label: 'Sunset · 17:45', sun: dirFrom(256, 6), sunColor: 0xff9a58, sunIntensity: 1.87, hemiSky: 0x93a3cc, hemiGround: 0x5e3f2a, hemi: 0.9, env: 0.62,
    fogColor: 0xd9a07c, fogFar: 1460, exposure: 1.1, sky: { horizon: 0xe8946a, zenith: 0x41558f, clouds: 0.4, cloudDensity: 0.38 }, night: 0 },
  night: { label: 'Night race · 21:00', sun: new THREE.Vector3(0.25, 0.92, 0.3).normalize(), sunColor: 0xe6eeff, sunIntensity: 1.2, hemiSky: 0x223352, hemiGround: 0x15140f, hemi: 0.32, env: 0.2,
    fogColor: 0x0b1220, fogFar: 930, exposure: 1.05, sky: { horizon: 0x0b1220, zenith: 0x02040c, clouds: 0.18, cloudDensity: 0.25 }, night: 1 },
};
export const TIME_ORDER = ['dawn', 'day', 'sunset', 'night'];

// Sky sphere of the given radius centred at (x, 0, z).
export function buildSky(radius, x, z, preset = RISE_DAY) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(preset.sunColor) },
    uHorizon: { value: new THREE.Color(preset.horizon) },
    uZenith: { value: new THREE.Color(preset.zenith) },
    uCoverage: { value: preset.clouds }, uDensity: { value: preset.cloudDensity },
    uTime: { value: 0 }, uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunColor, uHorizon, uZenith;
      uniform float uCoverage, uDensity, uTime, uNight;
      varying vec3 vWorld;
      float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float skyHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float skyNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(skyHash(i), skyHash(i + vec2(1, 0)), u.x), mix(skyHash(i + vec2(0, 1)), skyHash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int k = 0; k < 5; k++) { s += a * skyNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
        return s;
      }
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float up = max(dir.y, 0.0), mu = max(dot(dir, uSunDir), 0.0), day = 1.0 - uNight;
        // Rayleigh blue overhead, haze at the horizon, a warm Mie glow by the sun.
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.45));
        col += uSunColor * (0.35 * pow(mu, 8.0) + 0.6 * pow(mu, 64.0)) * (1.0 - 0.5 * up) * day;
        // The sun disc (about half a degree across, soft-edged); none at night.
        col += uSunColor * 30.0 * smoothstep(0.99996, 0.99999, mu) * day;
        // Night (the sim's night sky): stars in a 420-cell grid on the dome,
        // 1 cell in 400 lit, twinkling, fading out at the horizon, and a faint
        // band of glow across it.
        if (uNight > 0.0 && dir.y > 0.0) {
          vec3 g = dir * 420.0, cell = floor(g);
          float h = skyHash3(cell);
          vec3 offs = vec3(skyHash3(cell + 17.0), skyHash3(cell + 29.0), skyHash3(cell + 41.0)) * 0.6 + 0.2;
          float star = step(0.9975, h) * smoothstep(0.16, 0.0, length(fract(g) - offs)) * ((h - 0.9975) * 400.0 + 0.4) * smoothstep(0.0, 0.08, dir.y);
          float tw = sin(uTime * 3.0 + h * 800.0) * 0.35 + 0.65;
          float band = exp(-9.0 * abs(dot(dir, normalize(vec3(0.3, 0.2, 0.93))))) * 0.012 * up;
          col += uNight * (vec3(star * tw * 1.6) + vec3(0.6, 0.62, 0.8) * band);
        }
        // Cumulus on a layer overhead: fBm thresholded by the coverage, lit
        // on the sunward side, thinning out towards the horizon (dark at night).
        if (dir.y > 0.0) {
          vec2 p = dir.xz / (dir.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(p);
          float c = smoothstep(1.0 - uCoverage - 0.08, 1.0 - uCoverage + 0.22, n) * smoothstep(0.0, 0.18, dir.y);
          float shade = fbm(p + uSunDir.xz * 0.18);
          vec3 cloud = mix(vec3(0.62, 0.66, 0.72), vec3(1.0), clamp(0.55 + (n - shade) * 3.0, 0.0, 1.0)) * uSunColor;
          cloud += uSunColor * 0.5 * pow(mu, 12.0);
          cloud *= 1.0 - 0.93 * uNight;
          col = mix(col, cloud, c * clamp(uDensity * 2.0, 0.0, 1.0));
        } else col = mix(uHorizon, uHorizon * 0.8, min(-dir.y * 4.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  sky.position.set(x, 0, z);
  sky.name = 'rise-sky';
  sky.frustumCulled = false;
  const start = performance.now();
  let sun;
  sky.onBeforeRender = (renderer, scene) => {
    uniforms.uTime.value = (performance.now() - start) / 1000;
    if (sun === undefined) { sun = null; scene.traverse(o => { if (o.isDirectionalLight && !sun) sun = o; }); }
    if (sun) uniforms.uSunDir.value.subVectors(sun.position, sun.target.position).normalize();
  };
  return sky;
}

// Night glow, after the sim's emissive "* U.night" terms: the material glows
// `color` at `night` (at `day` otherwise, 0 by default); with useMap its own
// map is the glow's pattern. setNightGlow switches every such material under
// root. Strengths are the sim's halved, as our night light is about half its.
export function nightGlow(mat, color, night, { day = 0, useMap = false } = {}) {
  mat.emissive = new THREE.Color(color); mat.emissiveIntensity = day;
  if (useMap) mat.emissiveMap = mat.map;
  mat.userData.nightGlow = [day, night];
  return mat;
}
export function setNightGlow(root, night) {
  const seen = new Set();
  root.traverse(o => [o.material].flat().forEach(m => {
    const g = m?.userData?.nightGlow;
    if (g && !seen.has(m)) { seen.add(m); m.emissiveIntensity = g[0] + (g[1] - g[0]) * night; }
  }));
  return seen.size;
}

// Puts a time of day (a TIMES entry) on the sky dome; the sun's direction
// still comes from the scene's light.
export function setSkyTime(sky, t) {
  const u = sky.material.uniforms;
  u.uSunColor.value.set(t.sunColor); u.uHorizon.value.set(t.sky.horizon); u.uZenith.value.set(t.sky.zenith);
  u.uCoverage.value = t.sky.clouds; u.uDensity.value = t.sky.cloudDensity; u.uNight.value = t.night;
}
