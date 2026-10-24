import * as THREE from 'three';
import { FaceRig } from './face';

export type RockyState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'EXECUTING' | 'ERROR';

export const STATE_COLORS: Record<RockyState, string> = {
  IDLE: '#2f7bff',
  LISTENING: '#22d3ee',
  THINKING: '#7c6cff',
  SPEAKING: '#38bdf8',
  EXECUTING: '#00f5d4',
  ERROR: '#ff3b5c',
};

/** Sample points on a sphere / ellipsoid surface, biased so the cloud reads as a head + torso.
 * Also returns a scattered position per point, used by the intro: particles
 * start scattered in space and converge into the formed figure (uForm 0 -> 1). */
function sampleHumanoid(count: number): { pos: Float32Array; phase: Float32Array; base: Float32Array; scatter: Float32Array } {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const base = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // 55% head, 15% neck, 30% shoulders/torso
    const r = Math.random();
    let x = 0, y = 0, z = 0;
    if (r < 0.55) {
      // head: sphere radius ~1.0, slightly elongated, flattened face plane
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(1 - u * u);
      x = rad * Math.cos(th) * 0.95;
      y = u * 1.1 + 1.05;
      z = rad * Math.sin(th) * 0.95;
      if (z > 0.55 && Math.random() < 0.4) z *= 0.82; // hint of a face plane
    } else if (r < 0.7) {
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * 0.28;
      y = Math.random() * 0.5 - 0.35;
      z = Math.sin(th) * 0.28;
    } else {
      // shoulders / torso: wide ellipsoid shell
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.max(0, 1 - u * u));
      x = rad * Math.cos(th) * 1.55;
      y = u * 1.0 - 1.15;
      z = rad * Math.sin(th) * 0.7;
    }
    // sparse ambient dust particles far from the body
    if (Math.random() < 0.06) {
      x = (Math.random() - 0.5) * 7;
      y = (Math.random() - 0.5) * 6;
      z = (Math.random() - 0.5) * 4 - 1;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
    // scattered start: a wide, deep cloud the intro converges from
    const sr = 2.5 + Math.random() * 2.0;
    const sth = Math.random() * Math.PI * 2;
    const su = Math.random() * 2 - 1;
    const srad = Math.sqrt(Math.max(0, 1 - su * su));
    scatter[i * 3] = srad * Math.cos(sth) * sr;
    scatter[i * 3 + 1] = su * sr * 0.9;
    scatter[i * 3 + 2] = srad * Math.sin(sth) * sr - 1;
    phase[i] = Math.random() * Math.PI * 2;
  }
  return { pos, phase, base, scatter };
}

const VERT = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aScatter;
  uniform float uTime;
  uniform float uAmp;
  uniform float uDisperse;
  uniform float uOrbit;
  uniform float uSize;
  uniform float uForm;
  varying float vGlow;
  void main() {
    // intro convergence: scattered cloud -> formed figure (uForm 0 -> 1)
    vec3 p = mix(aScatter, position, uForm);
    float t = uTime + aPhase;
    // breathing + turbulence
    p.x += sin(t * 1.4) * 0.02 + sin(t * 3.1) * 0.015 * uAmp;
    p.y += sin(t * 1.1) * 0.03 + cos(t * 2.3) * 0.02 * uAmp;
    p.z += cos(t * 1.7) * 0.02;
    // orbit swirl (thinking / executing)
    float ang = uOrbit * 0.35 * sin(aPhase);
    float c = cos(ang), s = sin(ang);
    p.xz = mat2(c, -s, s, c) * p.xz;
    // dispersion: push particles radially outward, then they reform
    p *= (1.0 + uDisperse * (0.35 + 0.3 * sin(aPhase * 2.0)));
    // speaking wave: vertical ripple driven by real mic amplitude / TTS envelope
    p.y += sin(p.x * 2.5 + uTime * 9.0) * 0.12 * uAmp;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + uAmp * 0.9) * (180.0 / max(1.0, -mv.z));
    vGlow = 0.55 + 0.45 * sin(t * 2.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vGlow;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * (0.7 + 0.6 * vGlow), glow * 0.9);
  }
`;

export class RockyHologram {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private rings: THREE.Mesh[] = [];
  private groundRing!: THREE.Mesh;
  private raf = 0;
  private last = performance.now();
  private fpsSamples: number[] = [];
  private reduced = false;
  private disposed = false;
  private face: FaceRig;
  private introProgress = 1;
  private lowFpsStrikes = 0;
  state: RockyState = 'IDLE';
  amplitude = 0;
  quality: 'high' | 'low';

  constructor(private canvas: HTMLCanvasElement, opts: { isMobile: boolean; lowQuality: boolean }) {
    this.quality = opts.lowQuality ? 'low' : 'high';
    // Mobile default is deliberately lower than v1 (4500 -> 3200 pts, DPR cap 1.75)
    // because 9000 pts + DPR 2.5 was a real frame-rate risk on phones.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.isMobile && !opts.lowQuality, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.isMobile ? 1.75 : 2.0));
    this.renderer.setClearColor(0x050914, 1);
    this.scene.fog = new THREE.FogExp2(0x050914, 0.045);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0.2, 6.2);
    this.buildParticles(opts.isMobile ? 3200 : 7000);
    this.face = new FaceRig();
    this.face.group.position.set(0, 1.05, 0);
    this.scene.add(this.face.group);
    this.buildRings();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  private buildParticles(count: number) {
    const { pos, phase, scatter } = sampleHumanoid(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: 0 }, uDisperse: { value: 0 },
        uOrbit: { value: 0 }, uSize: { value: this.quality === 'low' ? 2.2 : 3.0 },
        uForm: { value: this.introProgress },
        uColor: { value: new THREE.Color(STATE_COLORS.IDLE) },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.scene.add(this.points);
  }

  private buildRings() {
    const ringGeo = new THREE.RingGeometry(0.98, 1.0, 128);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35 - i * 0.1, side: THREE.DoubleSide });
      const m = new THREE.Mesh(ringGeo, mat);
      m.rotation.x = Math.PI / 2.4;
      m.position.y = -1.2 + i * 0.45;
      this.scene.add(m);
      this.rings.push(m);
    }
    const gGeo = new THREE.RingGeometry(1.9, 2.0, 128);
    this.groundRing = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.y = -2.6;
    this.scene.add(this.groundRing);
  }

  setState(s: RockyState) {
    this.state = s;
    (this.material.uniforms.uColor.value as THREE.Color).set(STATE_COLORS[s]);
    this.face.setState(s);
  }

  setAmplitude(a: number) { this.amplitude = Math.max(0, Math.min(1, a)); }
  setGaze(x: number, y: number) { this.face.setGaze(x, y); }
  setMouth(a: number) { this.face.setMouth(a); }

  /** Intro progress 0..1. 0 = scattered cloud, 1 = formed face. The face
   * "wakes" (eyes open) only in the last part, so the sequence reads as
   * darkness -> convergence -> wake -> assistant, with no hard cut. */
  setIntro(p: number) {
    this.introProgress = Math.max(0, Math.min(1, p));
    this.face.setWake(this.introProgress < 0.8 ? 0 : (this.introProgress - 0.8) / 0.2);
  }

  setLowQuality(low: boolean) {
    this.quality = low ? 'low' : 'high';
    this.material.uniforms.uSize.value = low ? 2.2 : 3.0;
    if (low) this.renderer.setPixelRatio(1.25);
    if (low && !this.reduced) {
      // drop density by rebuilding with fewer points
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.buildParticles(2200);
      this.reduced = true;
    }
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    const u = this.material.uniforms;
    u.uTime.value = t;
    // intro easing: spring with a tiny overshoot only (Prompt Motion grammar:
    // one continuous morph, restrained easing, no bouncy easing, no dead time)
    const p = this.introProgress;
    const c1 = 1.70158, c3 = c1 + 1;
    const eased = p >= 1 ? 1 : 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    u.uForm.value = eased;
    // smooth amplitude decay so waves fall back gracefully
    u.uAmp.value += (this.amplitude - u.uAmp.value) * 0.25;
    const st = this.state;
    u.uDisperse.value = st === 'EXECUTING' ? 0.55 : st === 'ERROR' ? 0.25 + 0.2 * Math.sin(t * 8) : st === 'THINKING' ? 0.15 : 0.05;
    u.uOrbit.value = st === 'THINKING' ? 1 : st === 'EXECUTING' ? 1.6 : 0.15;
    // cinematic camera: push-in during the intro, gentle drift afterwards
    const camZ = p < 1 ? 8.8 - 2.6 * eased : 6.2;
    this.camera.position.x = Math.sin(t * 0.12) * 0.35;
    this.camera.position.y = 0.2 + Math.sin(t * 0.09) * 0.15;
    this.camera.position.z = camZ;
    this.camera.lookAt(0, -0.1, 0);
    this.face.update(t, dt);
    // energy rings expand with amplitude
    this.rings.forEach((ring, i) => {
      const s = 1 + u.uAmp.value * 0.5 + Math.sin(t * 2 + i) * 0.05;
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 - i * 0.1 + u.uAmp.value * 0.3;
    });
    (this.groundRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + u.uAmp.value * 0.4;
    this.points.rotation.y += dt * (st === 'THINKING' ? 0.35 : st === 'EXECUTING' ? 0.6 : 0.08);
    this.renderer.render(this.scene, this.camera);
    // adaptive quality: two sustained low-FPS windows -> actually reduce
    // density + pixel ratio here (v1 only notified and relied on the caller)
    if (dt > 0) this.fpsSamples.push(1 / Math.max(dt, 0.001));
    if (this.fpsSamples.length > 120) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.fpsSamples = [];
      if (avg < 24 && this.quality === 'high') {
        this.lowFpsStrikes++;
        window.dispatchEvent(new CustomEvent('rocky-low-fps', { detail: { fps: Math.round(avg) } }));
        if (this.lowFpsStrikes >= 2) this.setLowQuality(true);
      } else if (avg >= 24) {
        this.lowFpsStrikes = 0;
      }
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
