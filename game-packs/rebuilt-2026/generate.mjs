// Generates pack.json for REBUILT (2026) from cited measurements.
//
// Run from the repository root:  npm run packs:rebuilt
//
// Every measurement below names its source. See SOURCES.md for the full list,
// the assumptions, and what this pack does not model yet. The field is
// rotationally symmetric, so only the blue side is described here; red
// elements are blue elements rotated 180 degrees about the field center.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IN = 0.0254; // meters per inch
const r = (n) => Math.round(n * 10000) / 10000; // 0.1 mm precision

// --- Field (WPILib 2026 AprilTag layout, welded field) ---
const L = 16.541; // field length, x
const W = 8.069; // field width, y

// --- Hub (Manual 5.4; AprilTag 26 sits on the hub's alliance-facing side) ---
const TAG26_X = 4.022; // WPILib layout; also the ROBOT STARTING LINE (6328 FieldConstants)
const HUB_SIZE = 47 * IN; // 47 in square
const HUB_X = TAG26_X + HUB_SIZE / 2;
const HUB_Y = W / 2; // centered across the field width
const HUB_OPENING = 41.7 * IN; // hexagonal opening, modeled as a square
const HUB_RIM_Z = 72 * IN; // front edge of the opening above the carpet
const HUB_INNER_Z = 56.5 * IN; // bottom of the catcher (6328 FieldConstants innerHeight)
const RIM_THICKNESS = (HUB_SIZE - HUB_OPENING) / 2;

// --- Bumps (Manual 5.5): beside the hub, ramps slope toward both zones ---
const BUMP_WIDTH = 73 * IN; // along y
const BUMP_DEPTH = 44.4 * IN; // along x
const BUMP_HEIGHT = 6.513 * IN;

// --- Trenches (Manual 5.6; 6328 FieldConstants) ---
const TRENCH_TOP = 40.25 * IN;
const TRENCH_CLEARANCE = 22.25 * IN; // space underneath the arm
const TRENCH_BAR_DEPTH = 2.95 * IN; // horizontal arm thickness along x (6328)
const TRENCH_POST_WIDTH = 12 * IN; // between bump edge and opening (6328)
const TRENCH_POST_DEPTH = 0.3; // ASSUMPTION: not given in the manual text

// --- Tower (Manual 5.8; 6328 FieldConstants) ---
const TAG31_Y = 3.746; // WPILib layout; tower centerline
const TOWER_FRONT_X = 43.51 * IN;
const UPRIGHT_GAP = 32.25 * IN;
const UPRIGHT_THICK = 1.5 * IN; // along y
const UPRIGHT_DEEP = 3.5 * IN; // along x
const UPRIGHT_HEIGHT = 72.1 * IN;
const RUNG_DIAMETER = 1.66 * IN;
const RUNG_LENGTH = UPRIGHT_GAP + 2 * UPRIGHT_THICK + 2 * 5.875 * IN;
const RUNG_HEIGHTS = { low: 27 * IN, mid: 45 * IN, high: 63 * IN };

// --- Depot (Manual 5.7; 6328 FieldConstants) ---
const DEPOT_WIDTH = 42 * IN;
const DEPOT_DEPTH = 27 * IN;
const DEPOT_Y = W / 2 + 75.93 * IN;

// --- Fuel (Manual 5.10.1, 6.3.4) ---
const FUEL_RADIUS = (5.91 * IN) / 2;
const NEUTRAL_FUEL_WIDTH = 206 * IN; // along y
const NEUTRAL_FUEL_DEPTH = 72 * IN; // along x

// --- Helpers ---
const box = (center, size) => ({ center: center.map(r), size: size.map(r) });
const mirrorPoint = ([x, y, z]) => [L - x, W - y, z];
const mirrorBox = (b) => ({ center: mirrorPoint(b.center).map(r), size: b.size });

const obstacles = [];
const addBoth = (id, shape) => {
  obstacles.push({ id: `blue-${id}`, shape: { ...shape, ...box(shape.center, shape.size) } });
  obstacles.push({
    id: `red-${id}`,
    shape: { ...shape, ...mirrorBox(box(shape.center, shape.size)) },
  });
};
const solid = (center, size) => ({ kind: 'box', center, size });

// Hub: solid base up to the catcher, then four rim walls around the opening.
const rimHeight = HUB_RIM_Z - HUB_INNER_Z;
const rimZ = HUB_INNER_Z + rimHeight / 2;
addBoth('hub-base', solid([HUB_X, HUB_Y, HUB_INNER_Z / 2], [HUB_SIZE, HUB_SIZE, HUB_INNER_Z]));
const rimOffset = HUB_SIZE / 2 - RIM_THICKNESS / 2;
addBoth(
  'hub-rim-near',
  solid([HUB_X - rimOffset, HUB_Y, rimZ], [RIM_THICKNESS, HUB_SIZE, rimHeight]),
);
addBoth(
  'hub-rim-far',
  solid([HUB_X + rimOffset, HUB_Y, rimZ], [RIM_THICKNESS, HUB_SIZE, rimHeight]),
);
addBoth(
  'hub-rim-left',
  solid([HUB_X, HUB_Y + rimOffset, rimZ], [HUB_OPENING, RIM_THICKNESS, rimHeight]),
);
addBoth(
  'hub-rim-right',
  solid([HUB_X, HUB_Y - rimOffset, rimZ], [HUB_OPENING, RIM_THICKNESS, rimHeight]),
);

// Bumps: one on each side of the hub.
const bumpOffset = HUB_SIZE / 2 + BUMP_WIDTH / 2;
for (const [side, sign] of [
  ['left', 1],
  ['right', -1],
]) {
  addBoth(`bump-${side}`, {
    kind: 'ridge',
    ridgeAxis: 'y',
    center: [HUB_X, HUB_Y + sign * bumpOffset, BUMP_HEIGHT / 2],
    size: [BUMP_DEPTH, BUMP_WIDTH, BUMP_HEIGHT],
  });

  // Trench: a post beside the bump, then the arm over the opening to the guardrail.
  const bumpEdge = HUB_Y + sign * (HUB_SIZE / 2 + BUMP_WIDTH);
  const openingStart = bumpEdge + sign * TRENCH_POST_WIDTH;
  const wall = sign > 0 ? W : 0;
  addBoth(
    `trench-post-${side}`,
    solid(
      [HUB_X, (bumpEdge + openingStart) / 2, TRENCH_TOP / 2],
      [TRENCH_POST_DEPTH, TRENCH_POST_WIDTH, TRENCH_TOP],
    ),
  );
  const armHeight = TRENCH_TOP - TRENCH_CLEARANCE;
  addBoth(
    `trench-arm-${side}`,
    solid(
      [HUB_X, (openingStart + wall) / 2, TRENCH_CLEARANCE + armHeight / 2],
      [TRENCH_BAR_DEPTH, Math.abs(wall - openingStart), armHeight],
    ),
  );
}

// Tower: two uprights and three rungs (the climbing structure; climbing is not simulated yet).
const uprightX = TOWER_FRONT_X - UPRIGHT_DEEP / 2;
const uprightOffset = UPRIGHT_GAP / 2 + UPRIGHT_THICK / 2;
for (const [side, sign] of [
  ['left', 1],
  ['right', -1],
]) {
  addBoth(
    `tower-upright-${side}`,
    solid(
      [uprightX, TAG31_Y + sign * uprightOffset, UPRIGHT_HEIGHT / 2],
      [UPRIGHT_DEEP, UPRIGHT_THICK, UPRIGHT_HEIGHT],
    ),
  );
}
for (const [name, z] of Object.entries(RUNG_HEIGHTS)) {
  addBoth(
    `tower-rung-${name}`,
    solid([uprightX, TAG31_Y, z], [RUNG_DIAMETER, RUNG_LENGTH, RUNG_DIAMETER]),
  );
}

// Goals: the volume inside the hub opening, between the catcher and the rim.
const goalBox = box([HUB_X, HUB_Y, rimZ], [HUB_OPENING - 0.06, HUB_OPENING - 0.06, rimHeight]);
// Recycling: fuel leaves through exits at the hub base facing the neutral zone (Manual 5.4).
const blueExit = {
  box: box([HUB_X + HUB_SIZE / 2 + 0.1, HUB_Y, FUEL_RADIUS + 0.02], [0.05, HUB_SIZE * 0.8, 0.02]),
  velocity: [1.5, 0, 0], // ASSUMPTION: exit speed
};
const recycleDelay = 1.0; // ASSUMPTION: processing time inside the hub
const goals = [
  {
    id: 'blue-hub',
    box: goalBox,
    creditAlliance: 'blue',
    recycle: { delaySeconds: recycleDelay, exit: blueExit },
  },
  {
    id: 'red-hub',
    box: mirrorBox(goalBox),
    creditAlliance: 'red',
    recycle: {
      delaySeconds: recycleDelay,
      exit: { box: mirrorBox(blueExit.box), velocity: [-1.5, 0, 0] },
    },
  },
];

// Zones (Manual 5.2): display only for now.
const allianceDepth = TAG26_X; // ALLIANCE ZONE ends at the ROBOT STARTING LINE
const neutralDepth = 283 * IN;
const zones = [
  {
    id: 'blue-alliance-zone',
    kind: 'allianceZone',
    alliance: 'blue',
    box: box([allianceDepth / 2, W / 2, 1], [allianceDepth, W, 2]),
  },
  {
    id: 'red-alliance-zone',
    kind: 'allianceZone',
    alliance: 'red',
    box: box([L - allianceDepth / 2, W / 2, 1], [allianceDepth, W, 2]),
  },
  { id: 'neutral-zone', kind: 'neutralZone', box: box([L / 2, W / 2, 1], [neutralDepth, W, 2]) },
];

// Fuel staging (Manual 6.3.4): 24 per depot, 360 in the neutral zone with full preloads.
// The 24 in each OUTPOST CHUTE belong to human players, which are not modeled yet.
const depotFuel = box(
  [DEPOT_DEPTH / 2, DEPOT_Y, FUEL_RADIUS],
  [DEPOT_DEPTH, DEPOT_WIDTH, FUEL_RADIUS * 2],
);
const pieceSpawnAreas = [
  { id: 'blue-depot', type: 'fuel', box: depotFuel, count: 24, jitter: 0.005 },
  { id: 'red-depot', type: 'fuel', box: mirrorBox(depotFuel), count: 24, jitter: 0.005 },
  {
    id: 'neutral-zone',
    type: 'fuel',
    box: box(
      [L / 2, W / 2, FUEL_RADIUS],
      [NEUTRAL_FUEL_DEPTH, NEUTRAL_FUEL_WIDTH, FUEL_RADIUS * 2],
    ),
    count: 360,
    jitter: 0.01,
  },
];

const periodPoints = {
  auto: 1,
  transition: 1,
  'shift-1': 1,
  'shift-2': 1,
  'shift-3': 1,
  'shift-4': 1,
  endgame: 1,
};

const pack = {
  formatVersion: 1,
  id: 'rebuilt-2026',
  name: 'REBUILT presented by Haas',
  season: 2026,
  source: {
    manualRevision: '2026 Game Manual with Team Updates through TU22 (final); see SOURCES.md',
    url: 'https://www.firstinspires.org/resources/library/frc/season-materials',
  },
  field: {
    size: [L, W],
    wallHeight: r(20 * IN), // guardrail height (Manual 5.2); alliance walls are taller
    // Manual 5.2: Shaw Philadelphia Commercial Neyland II 20, the standard FRC carpet.
    // Omitting `carpet` uses the engine's FRC_CARPET estimates for that exact carpet.
    obstacles,
    goals,
    zones,
  },
  pieceTypes: [
    {
      id: 'fuel',
      name: 'FUEL',
      shape: { kind: 'sphere', radius: r(FUEL_RADIUS) },
      mass: 0.215, // Manual: 0.203-0.227 kg; midpoint
      // The fuel's own surface. The engine combines it with the carpet (and with
      // anything else it touches), so these are not foam-on-carpet values.
      friction: 0.7, // ASSUMPTION: high-density foam
      restitution: 0.35, // ASSUMPTION: high-density foam
    },
  ],
  pieceSpawnAreas,
  preload: { type: 'fuel', maxPerRobot: 8 },
  match: {
    periods: [
      { id: 'auto', durationSeconds: 20 },
      { id: 'transition', durationSeconds: 10 },
      { id: 'shift-1', durationSeconds: 25 },
      { id: 'shift-2', durationSeconds: 25 },
      { id: 'shift-3', durationSeconds: 25 },
      { id: 'shift-4', durationSeconds: 25 },
      { id: 'endgame', durationSeconds: 30 },
    ],
  },
  scoring: [
    {
      id: 'fuel-blue-hub',
      when: 'pieceEntersGoal',
      goals: ['blue-hub'],
      pieceTypes: ['fuel'],
      points: periodPoints,
    },
    {
      id: 'fuel-red-hub',
      when: 'pieceEntersGoal',
      goals: ['red-hub'],
      pieceTypes: ['fuel'],
      points: periodPoints,
    },
  ],
  robotRules: {
    maxFramePerimeter: r(110 * IN), // Inspection Checklist: ROBOT PERIMETER <= 110 in
    maxHeight: r(30 * IN), // Inspection Checklist: starting height <= 30 in
    maxExtension: r(12 * IN), // UNVERIFIED: see SOURCES.md
    maxMass: 52.16, // Inspection Checklist: <= 115 lb excluding BUMPERS and battery
  },
  mechanics: ['rebuilt-hub-shifts'],
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
console.log(
  `wrote pack.json: ${obstacles.length} obstacles, ${goals.length} goals, ` +
    `${pieceSpawnAreas.reduce((n, a) => n + a.count, 0)} fuel staged on the field`,
);
