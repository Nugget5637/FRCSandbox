import * as THREE from 'three';
import {
  createSimulation,
  loadGamePack,
  SIM_STEP_SECONDS,
  type RobotEntry,
  type Simulation,
} from '@frcsandbox/sim';
import rebuiltData from '../../../game-packs/rebuilt-2026/pack.json';
import reefscapeData from '../../../game-packs/reefscape-2025/pack.json';
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

// `?pack=reefscape` shows the 2025 field; REBUILT is the default until the
// game picker arrives in Milestone 6.
const reefscape = new URLSearchParams(location.search).get('pack') === 'reefscape';
const pack = loadGamePack(reefscape ? reefscapeData : rebuiltData);

const robot: RobotEntry = {
  id: 'blue-1',
  alliance: 'blue',
  spec: {
    frame: { length: 0.6858, width: 0.6858, height: 0.5 },
    mass: 50,
    maxSpeed: 4.5,
    // Swerve drives reach and leave full speed quickly. ~22 m/s^2 is roughly 0
    // to 4.5 m/s in a fifth of a second.
    maxAcceleration: 22,
    // Turning is slower: 2*pi rad/s is a full 360 degrees in about one second.
    maxTurnRate: 2 * Math.PI,
    // Turning eases in and out like translation, reaching full turn rate in
    // about a third of a second rather than snapping.
    maxAngularAcceleration: 6 * Math.PI,
    intake: { reach: 0.25, width: 0.6, capacity: 40 },
    release: { height: 0.5, speed: 6.4, pitch: (70 * Math.PI) / 180 },
  },
  // REEFSCAPE robots start between the ROBOT STARTING LINE and the BARGE, facing the reef.
  start: reefscape ? { x: 7.9, y: 6.0, yaw: Math.PI } : { x: 2.0, y: 4.0345, yaw: 0 },
  preload: pack.preload?.maxPerRobot ?? 0,
};
/** Human player stations the player controls (their own alliance's). */
const ownStations = pack.humanPlayerStations
  .filter((s) => s.alliance === robot.alliance)
  .map((s) => s.id);

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const field = new FieldRenderer(pack);
const cameras = new DriverCameras(glCanvas.clientWidth / glCanvas.clientHeight);
const hud = new Hud(
  hudCanvas,
  pack,
  'WASD drive · Q/E turn · J intake · K shoot · H human player feed · Space pause · R restart',
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
      const feed = input.held('KeyH');
      sim.step(
        { [robot.id]: control },
        Object.fromEntries(ownStations.map((id) => [id, { feed }])),
      );
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
