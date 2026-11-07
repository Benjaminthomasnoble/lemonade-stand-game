// Post: a soft tilt-shift at the top and bottom of the frame and a warm
// vignette (from the clay mockup), on an EffectComposer. The scene renders
// into a multisampled half-float target; OutputPass does tone mapping and sRGB.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TiltShader = {
  name: 'ClayTiltShift',
  uniforms: {
    tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.5 }, uBand: { value: 0.16 }, uAmt: { value: 2.4 }, uVig: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uAmt; uniform float uVig; uniform vec3 uTint; varying vec2 vUv;
  void main() {
    float d = abs( vUv.y - uFocus );
    float k = smoothstep( uBand, uBand + 0.32, d ) * uAmt;
    vec2 st = uDir / uRes * k;
    vec4 c = texture2D( tDiffuse, vUv );
    if ( k > 0.001 ) {
      c *= 0.2270270270;
      c += texture2D( tDiffuse, vUv + st * 1.3846153846 ) * 0.3162162162;
      c += texture2D( tDiffuse, vUv - st * 1.3846153846 ) * 0.3162162162;
      c += texture2D( tDiffuse, vUv + st * 3.2307692308 ) * 0.0702702703;
      c += texture2D( tDiffuse, vUv - st * 3.2307692308 ) * 0.0702702703;
    }
    if ( uVig > 0.0 ) { vec2 q = ( vUv - 0.5 ) * vec2( 1.0, 1.15 ); float v = 1.0 - uVig * smoothstep( 0.12, 0.62, dot( q, q ) * 1.9 ); c.rgb *= mix( uTint, vec3( 1.0 ), v ) * v; }
    gl_FragColor = c;
  }`,
};

export interface ClayPost {
  composer: EffectComposer;
  render(): void;
  /** Call with the canvas CSS size; picks up the renderer's pixel ratio. */
  setSize(w: number, h: number): void;
  /** Blur strength (texel steps at the frame edges; 0 skips the blur), vignette 0..1 and the in-focus band's centre (0 bottom, 1 top). */
  tilt(amount: number, vignette: number, focus?: number): void;
  /** Vignette tint (warm by day, indigo at night). */
  tint(color: THREE.ColorRepresentation): void;
  dispose(): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, samples = 4): ClayPost {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const h = new ShaderPass(TiltShader), v = new ShaderPass(TiltShader);
  v.uniforms.uDir.value.set(0, 1); v.uniforms.uVig.value = 0.55; v.uniforms.uTint.value.set('#c98a6a');
  composer.addPass(h); composer.addPass(v);
  composer.addPass(new OutputPass());
  return {
    composer,
    render: () => composer.render(),
    setSize(w, hh) {
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr); composer.setSize(w, hh);
      for (const p of [h, v]) p.uniforms.uRes.value.set(w * pr, hh * pr);
    },
    tilt(amt, vig, focus = 0.5) {
      for (const p of [h, v]) { p.uniforms.uAmt.value = amt; p.uniforms.uFocus.value = focus; }
      h.enabled = amt > 0.01; // phones: no blur, the vertical pass still lays the vignette
      v.uniforms.uVig.value = vig;
    },
    tint(c) { v.uniforms.uTint.value.set(c); },
    dispose() { composer.dispose(); rt.dispose(); },
  };
}
