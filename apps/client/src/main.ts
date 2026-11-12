import * as THREE from 'three';
import {
  createSimulation,
  loadGamePack,
  SIM_STEP_SECONDS,
  type RobotEntry,
  type Simulation,
} from '@frcsandbox/sim';
import rebuiltData from '../../../game-packs/rebuilt-2026/pack.json';
import { DriverCameras } from './render/cameras';
import { FieldRenderer } from './render/field-renderer';
import { Hud } from './hud';
import { InputManager } from './input';
import { setupTouchControls } from './touch';

/**
 * Milestone 3: 3D rendering and driving.
 *
 * Runs the REBUILT pack in the real engine at a fixed 60 Hz step and renders it
 * in 3D with WebGL2. Rendering interpolates between steps so motion stays smooth
 * regardless of display frame rate. Three driver cameras (chase, broadcast,
 * driver station) cycle with Tab. The bot creator arrives in Milestone 4.
 */

const app = document.querySelector<HTMLElement>('#app');
const glCanvas = document.querySelector<HTMLCanvasElement>('#viewport');
const hudCanvas = document.querySelector<HTMLCanvasElement>('#hud');
const statusEl = document.querySelector<HTMLParagraphElement>('#status');
if (!app || !glCanvas || !hudCanvas || !statusEl) throw new Error('missing page elements');
const view: HTMLCanvasElement = glCanvas;

const pack = loadGamePack(rebuiltData);

const robot: RobotEntry = {
  id: 'blue-1',
  alliance: 'blue',
  spec: {
    frame: { length: 0.6858, width: 0.6858, height: 0.5 },
    mass: 50,
    maxSpeed: 4.5,
    maxAcceleration: 6,
    maxTurnRate: 6,
    intake: { reach: 0.25, width: 0.6, capacity: 40 },
    release: { height: 0.5, speed: 6.4, pitch: (70 * Math.PI) / 180 },
  },
  start: { x: 2.0, y: 4.0345, yaw: 0 },
  preload: 8,
};

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const field = new FieldRenderer(pack);
const cameras = new DriverCameras(glCanvas.clientWidth / glCanvas.clientHeight);
const hud = new Hud(
  hudCanvas,
  pack,
  'WASD drive · Q/E turn · J intake · K shoot · Space pause · R restart',
);
const input = new InputManager();
setupTouchControls(app, input);

let sim: Simulation;
let paused = false;
let accumulator = 0;
let last = performance.now();

async function restart(): Promise<void> {
  sim?.dispose();
  sim = await createSimulation({ pack, robots: [robot], seed: 1 });
  accumulator = 0;
}

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h, false);
  cameras.setAspect(w / h);
}

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (input.pressed('Tab')) cameras.cycle();
  if (input.pressed('KeyP') || input.pressed('Space')) paused = !paused;
  if (input.pressed('KeyR')) void restart();

  if (!paused && !sim.finished) {
    accumulator += dt;
    while (accumulator >= SIM_STEP_SECONDS) {
      const snapshot = sim.snapshot();
      const control = input.sample(cameras.controlFrame, snapshot.robots[0]?.pose.yaw ?? 0);
      sim.step({ [robot.id]: control });
      accumulator -= SIM_STEP_SECONDS;
    }
  }

  const snapshot = sim.snapshot();
  field.update(snapshot);
  if (snapshot.robots[0]) cameras.update({ pack, robot: snapshot.robots[0], dt });
  renderer.render(field.scene, cameras.camera);
  hud.draw(snapshot, sim.getEvents(), cameras.label());

  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);

statusEl.style.display = 'none';
void restart().then(() => {
  resize();
  requestAnimationFrame(frame);
});
