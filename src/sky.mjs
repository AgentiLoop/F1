// Sky dome after the RISE Motordrome sim's js/sky.js "Day · 10:30" preset:
// a Rayleigh-blue zenith fading to a pale, hazy horizon, a sun disc with a
// Mie glow around it and a drifting deck of cumulus (its SkyMesh cloud
// coverage 0.42, density 0.42). Their WebGPU SkyMesh/TSL nodes are re-done
// here as a WebGL shader. The sun sits where the scene's directional light
// shines from, so the disc agrees with the shadows.
import * as THREE from '../vendor/three.module.js';

// RISE day preset colours (sunColor 0xfff1dc, fogColor 0xbcd0e2 as the horizon).
export const RISE_DAY = { sunColor: 0xfff1dc, horizon: 0xbcd0e2, zenith: 0x2f6db5, clouds: 0.42, cloudDensity: 0.42 };

// Sky sphere of the given radius centred at (x, 0, z).
export function buildSky(radius, x, z, preset = RISE_DAY) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(preset.sunColor) },
    uHorizon: { value: new THREE.Color(preset.horizon) },
    uZenith: { value: new THREE.Color(preset.zenith) },
    uCoverage: { value: preset.clouds }, uDensity: { value: preset.cloudDensity },
    uTime: { value: 0 },
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
      uniform float uCoverage, uDensity, uTime;
      varying vec3 vWorld;
      float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
        float up = max(dir.y, 0.0), mu = max(dot(dir, uSunDir), 0.0);
        // Rayleigh blue overhead, haze at the horizon, a warm Mie glow by the sun.
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.45));
        col += uSunColor * (0.35 * pow(mu, 8.0) + 0.6 * pow(mu, 64.0)) * (1.0 - 0.5 * up);
        // The sun disc (about half a degree across, soft-edged).
        col += uSunColor * 30.0 * smoothstep(0.99996, 0.99999, mu);
        // Cumulus on a layer overhead: fBm thresholded by the coverage, lit
        // on the sunward side, thinning out towards the horizon.
        if (dir.y > 0.0) {
          vec2 p = dir.xz / (dir.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(p);
          float c = smoothstep(1.0 - uCoverage - 0.08, 1.0 - uCoverage + 0.22, n) * smoothstep(0.0, 0.18, dir.y);
          float shade = fbm(p + uSunDir.xz * 0.18);
          vec3 cloud = mix(vec3(0.62, 0.66, 0.72), vec3(1.0), clamp(0.55 + (n - shade) * 3.0, 0.0, 1.0)) * uSunColor;
          cloud += uSunColor * 0.5 * pow(mu, 12.0);
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
