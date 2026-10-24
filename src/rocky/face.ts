import * as THREE from 'three';
import type { RockyState } from './hologram';

// Local copy of the state colours (kept in sync with hologram.ts) so that
// face.ts does not create a circular module import with hologram.ts.
const STATE_COLORS: Record<RockyState, string> = {
  IDLE: '#2f7bff', LISTENING: '#22d3ee', THINKING: '#7c6cff',
  SPEAKING: '#38bdf8', EXECUTING: '#00f5d4', ERROR: '#ff3b5c',
};

/**
 * Procedural holographic head — original geometry, no stock model, no image.
 * A translucent shell + wireframe skull, glowing eyes with real gaze,
 * brows, a nose cone, and a jaw/mouth that opens with speech amplitude.
 * This is a stylised hologram head, not a photorealistic face: the point is
 * readable eyes, gaze, blinking and mouth motion driven by real app state.
 * Head centre is at the group origin; the caller positions the group.
 */
export class FaceRig {
  group = new THREE.Group();
  private eyeL: THREE.Group;
  private eyeR: THREE.Group;
  private pupilL: THREE.Mesh;
  private pupilR: THREE.Mesh;
  private browL: THREE.Mesh;
  private browR: THREE.Mesh;
  private jaw: THREE.Group;
  private mouth: THREE.Mesh;
  private shell: THREE.Mesh;
  private wire: THREE.Mesh;
  private eyeMat: THREE.MeshBasicMaterial;
  private gazeX = 0;
  private gazeY = 0;
  private targetX = 0;
  private targetY = 0;
  private nextSaccade = 2;
  private blinkT = -1;
  private nextBlink = 2.5;
  private mouthOpen = 0;
  private wake = 1; // 0 = eyes closed (intro), 1 = awake
  private state: RockyState = 'IDLE';

  constructor() {
    const shellGeo = new THREE.SphereGeometry(1.0, 32, 24);
    shellGeo.scale(0.92, 1.08, 0.95);
    this.shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0x1e6fff, transparent: true, opacity: 0.10, depthWrite: false }));
    this.wire = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false }));
    this.group.add(this.shell, this.wire);

    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.95 });
    const mkEye = (side: number): { g: THREE.Group; pupil: THREE.Mesh } => {
      const g = new THREE.Group();
      g.position.set(side * 0.36, 0.22, 0.88);
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), this.eyeMat);
      sclera.scale.set(1.25, 0.8, 0.5);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color: 0x062a5e }));
      pupil.position.set(0, 0, 0.08);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.03, 0.03, 0.13);
      g.add(sclera, pupil, glint);
      this.group.add(g);
      return { g, pupil };
    };
    const l = mkEye(-1); const r = mkEye(1);
    this.eyeL = l.g; this.eyeR = r.g; this.pupilL = l.pupil; this.pupilR = r.pupil;

    const browGeo = new THREE.BoxGeometry(0.28, 0.04, 0.04);
    const browMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
    this.browL = new THREE.Mesh(browGeo, browMat); this.browL.position.set(-0.36, 0.5, 0.9);
    this.browR = new THREE.Mesh(browGeo, browMat); this.browR.position.set(0.36, 0.5, 0.9);
    this.group.add(this.browL, this.browR);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, depthWrite: false }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.02, 0.98);
    this.group.add(nose);

    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.52, 0.6);
    const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: 0x1e6fff, transparent: true, opacity: 0.16, depthWrite: false }));
    jawMesh.scale.set(1.1, 0.55, 0.8); jawMesh.position.set(0, -0.12, 0.1);
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.9 }));
    this.mouth.position.set(0, 0.02, 0.36);
    this.jaw.add(jawMesh, this.mouth);
    this.group.add(this.jaw);
  }

  setState(s: RockyState) {
    this.state = s;
    const c = new THREE.Color(STATE_COLORS[s]);
    this.eyeMat.color.set(s === 'ERROR' ? 0xff6b81 : 0xbfefff);
    (this.wire.material as THREE.MeshBasicMaterial).color.set(c);
  }

  setGaze(x: number, y: number) { this.targetX = Math.max(-1, Math.min(1, x)); this.targetY = Math.max(-1, Math.min(1, y)); }
  setMouth(a: number) { this.mouthOpen = Math.max(0, Math.min(1, a)); }
  setWake(w: number) { this.wake = Math.max(0, Math.min(1, w)); }

  update(t: number, dt: number) {
    // idle saccades: if the user is not actively pointing, the eyes wander
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      this.nextSaccade = 2 + Math.random() * 2.5;
      this.targetX = (Math.random() - 0.5) * 0.9;
      this.targetY = (Math.random() - 0.5) * 0.5;
    }
    this.gazeX += (this.targetX - this.gazeX) * Math.min(1, dt * 4);
    this.gazeY += (this.targetY - this.gazeY) * Math.min(1, dt * 4);

    // head yaw/pitch: idle sway + partial gaze follow (never a full turn)
    this.group.rotation.y = Math.sin(t * 0.4) * 0.06 + this.gazeX * 0.15;
    this.group.rotation.x = Math.sin(t * 0.3) * 0.04 - this.gazeY * 0.08;
    this.group.position.y = 1.05 + Math.sin(t * 1.1) * 0.03;

    // pupils follow gaze
    this.pupilL.position.x = this.gazeX * 0.04; this.pupilL.position.y = this.gazeY * 0.03;
    this.pupilR.position.x = this.gazeX * 0.04; this.pupilR.position.y = this.gazeY * 0.03;

    // blinking: 0.12s close, every ~2.5-5s, plus intro wake (eyes open at the end)
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blinkT = 0; this.nextBlink = 2.5 + Math.random() * 2.5; }
    let eyeScale = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const p = this.blinkT / 0.14;
      eyeScale = p >= 1 ? 1 : 1 - Math.sin(Math.min(1, p) * Math.PI) * 0.92;
      if (p >= 1) this.blinkT = -1;
    }
    eyeScale *= 0.15 + 0.85 * this.wake;
    this.eyeL.scale.y = eyeScale; this.eyeR.scale.y = eyeScale;

    // brows: thinking raises them, error lowers them
    const tilt = this.state === 'THINKING' ? 0.18 : this.state === 'ERROR' ? -0.18 : 0.03;
    this.browL.rotation.z = tilt; this.browR.rotation.z = -tilt;

    // jaw/mouth: mouth box grows and jaw drops with amplitude
    const m = this.mouthOpen;
    this.mouth.scale.y = 0.25 + m * 2.2;
    (this.mouth.material as THREE.MeshBasicMaterial).opacity = 0.55 + m * 0.45;
    this.jaw.rotation.x = m * 0.35;
  }
}
