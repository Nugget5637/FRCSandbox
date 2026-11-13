import { beforeAll, describe, expect, it } from 'vitest';
import { createSimulation, initPhysics, loadGamePack, type RobotEntry } from '@frcsandbox/sim';
import rebuilt from '../../../../game-packs/rebuilt-2026/pack.json';
import reefscape from '../../../../game-packs/reefscape-2025/pack.json';
import { FieldRenderer } from './field-renderer';
import { CAMERA_MODES, DriverCameras } from './cameras';

/**
 * Builds the scene and cameras without a GPU. Three.js constructs its scene
 * graph and math on the CPU, so this catches geometry and camera-placement
 * mistakes headlessly. It does not prove the pixels look right; that needs a
 * human running `npm run dev`.
 */
const pack = loadGamePack(rebuilt);

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
  start: { x: 2, y: 4.0345, yaw: 0 },
  preload: 8,
};

beforeAll(async () => {
  await initPhysics();
});

describe('FieldRenderer', () => {
  it('builds a scene with lights, structures, goals, and a piece mesh', () => {
    const field = new FieldRenderer(pack);
    let meshes = 0;
    let instanced = 0;
    let lights = 0;
    field.scene.traverse((o) => {
      const mesh = o as { isInstancedMesh?: boolean; isMesh?: boolean };
      if (mesh.isInstancedMesh) instanced += 1;
      else if (mesh.isMesh) meshes += 1;
      else if (o.type.endsWith('Light')) lights += 1;
    });
    expect(lights).toBeGreaterThanOrEqual(2);
    expect(instanced).toBe(1); // one InstancedMesh for all game pieces
    // 32 obstacles + 2 goals + carpet + 2 alliance strips = 37 static meshes.
    expect(meshes).toBeGreaterThanOrEqual(35);
  });

  it('shows the staged fuel after a few simulation steps', async () => {
    const field = new FieldRenderer(pack);
    const sim = await createSimulation({ pack, robots: [robot], seed: 1 });
    for (let i = 0; i < 30; i++) sim.step({});
    field.update(sim.snapshot());
    const pieceMesh = field.scene.children.find(
      (c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh,
    ) as unknown as { count: number };
    // 408 staged on the field; 8 preloaded are hidden inside the robot.
    expect(pieceMesh.count).toBeGreaterThan(400);
    expect(pieceMesh.count).toBeLessThanOrEqual(408);
    sim.dispose();
  });
});

describe('DriverCameras', () => {
  it('cycles through chase, broadcast, and three driver stations', () => {
    const cams = new DriverCameras(16 / 9);
    const labels = [cams.label()];
    for (let i = 0; i < 4; i++) {
      cams.cycle();
      labels.push(cams.label());
    }
    expect(labels).toEqual([
      'broadcast',
      'driver station 1',
      'driver station 2',
      'driver station 3',
      'chase',
    ]);
  });

  it('places each camera on the correct side and uses the right control frame', async () => {
    const sim = await createSimulation({ pack, robots: [robot], seed: 1 });
    const snap = sim.snapshot();
    const cams = new DriverCameras(16 / 9);

    for (const mode of CAMERA_MODES) {
      while (cams.currentMode !== mode) cams.cycle();
      cams.update({ pack, robot: snap.robots[0]!, dt: 1 / 60 });
      const pos = cams.camera.position;
      expect(Number.isFinite(pos.x) && Number.isFinite(pos.z)).toBe(true);
      if (mode === 'chase') {
        // Behind a robot facing +x, so to its -x side, and above it.
        expect(pos.x).toBeLessThan(snap.robots[0]!.pose.x);
        expect(pos.z).toBeGreaterThan(0.5);
        expect(cams.controlFrame).toBe('robot');
      } else if (mode === 'broadcast') {
        // Fixed behind and above the blue wall, centered on width, driving field-relative.
        expect(pos.x).toBeLessThan(0);
        expect(pos.y).toBeCloseTo(pack.field.size[1] / 2, 3);
        expect(pos.z).toBeGreaterThan(5);
        expect(cams.controlFrame).toBe('field');
      } else {
        // Driver station sits behind the blue wall and drives field-relative.
        expect(pos.x).toBeLessThan(snap.robots[0]!.pose.x);
        expect(cams.controlFrame).toBe('field');
      }
    }
    sim.dispose();
  });

  it('eases the broadcast zoom in over about a second when crossing the line', async () => {
    const sim = await createSimulation({ pack, robots: [robot], seed: 1 });
    const cams = new DriverCameras(16 / 9);
    while (cams.currentMode !== 'broadcast') cams.cycle();

    // Robot deep in its own zone: camera settles pulled back.
    const near = { ...sim.snapshot().robots[0]!, pose: { x: 1, y: 4, z: 0.25, yaw: 0 } };
    for (let i = 0; i < 120; i++) cams.update({ pack, robot: near, dt: 1 / 60 });
    const pulledBack = cams.camera.position.z;

    // Robot crosses downfield: zoom eases in, so the camera lowers over ~1 s.
    const far = { ...near, pose: { x: 8, y: 4, z: 0.25, yaw: 0 } };
    cams.update({ pack, robot: far, dt: 1 / 60 });
    const justAfter = cams.camera.position.z;
    for (let i = 0; i < 120; i++) cams.update({ pack, robot: far, dt: 1 / 60 });
    const zoomedIn = cams.camera.position.z;

    expect(zoomedIn).toBeLessThan(pulledBack); // ended lower (zoomed in)
    expect(Math.abs(justAfter - pulledBack)).toBeLessThan(Math.abs(zoomedIn - justAfter)); // eased, not instant
    sim.dispose();
  });
});

describe('FieldRenderer with REEFSCAPE', () => {
  it('draws one instanced mesh per piece type and rotates the reef branches', async () => {
    const reef = loadGamePack(reefscape);
    const field = new FieldRenderer(reef);
    const sim = await createSimulation({ pack: reef, robots: [], seed: 1 });
    for (let i = 0; i < 10; i++) sim.step();
    field.update(sim.snapshot());
    const instanced = field.scene.children.filter(
      (c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh,
    ) as unknown as { count: number }[];
    expect(instanced.map((m) => m.count)).toEqual([6, 18]); // coral, algae on the field
    const rotated = field.scene.children.filter((c) => c.quaternion.w < 0.999999);
    expect(rotated.length).toBeGreaterThan(100); // reef hexagons, branches, goals
    sim.dispose();
  });
});
