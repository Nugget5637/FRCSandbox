// Generates pack.json for REEFSCAPE (2025) from cited measurements.
//
// Run from the repository root:  npm run packs:reefscape
//
// Every measurement below names its source. See SOURCES.md for the full list,
// the assumptions, and what this pack does not model yet. Sources:
//   Manual  = 2025 Game Manual (frcmanual.com/2025), section numbers as cited
//   WPILib  = WPILib 2025 AprilTag layout, 2025-reefscape-welded.json at tag v2025.3.2
//   Checklist = 2025 FRC Inspection Checklist
//   6328    = Team 6328 RobotCode2025Public FieldConstants.java
// The field is rotationally symmetric, so only the blue side is described here;
// red elements are blue elements rotated 180 degrees about the field center.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IN = 0.0254; // meters per inch
const DEG = Math.PI / 180;
const r = (n) => Math.round(n * 10000) / 10000; // 0.1 mm precision

// --- Field (WPILib layout; Manual 5.1: ~26 ft 5 in by ~57 ft 6 7/8 in) ---
const L = 17.548; // field length, x
const W = 8.052; // field width, y
const GUARDRAIL_HEIGHT = 20 * IN; // Manual 5.1: 1 ft 8 in

// --- Reef (Manual 5.3; WPILib tags 17-22; 6328) ---
const REEF_X = (3.6576 + 5.321) / 2; // WPILib: midpoint of tags 18 and 21 (6328: 176.746 in)
const REEF_Y = W / 2; // Manual 5.3: centered between the guardrails
const REEF_FACE_TO_FACE = 65.5 * IN; // Manual 5.3: 5 ft 5 1/2 in hexagon
const REEF_SIDE = REEF_FACE_TO_FACE / Math.sqrt(3); // regular hexagon side length
const TROUGH_EDGE_Z = 18 * IN; // Manual 5.3: trough front edge 1 ft 6 in off the carpet
const PIPE_OD = 1.66 * IN; // Manual 5.3: 1 1/4 in Schedule 40 steel (1.66 in OD)
const PIPE_SPACING = 13 * IN; // Manual 5.3: pipes on a face 1 ft 1 in apart, center to center
const BRANCH_TIP_RADIUS = 30.738 * IN; // 6328: reef center to branch end, along the face normal
const BRANCH_ANGLE = 35 * DEG; // Manual 5.3: L2 and L3 angled up at 35 degrees
// Branch end heights. Manual 5.3 gives the highest point; 6328 lowers it to the
// center of the pipe end by cos(35 deg) * 0.625 in.
const TIP_Z = {
  l2: (31.875 - Math.cos(BRANCH_ANGLE) * 0.625) * IN, // Manual: 2 ft 7 7/8 in
  l3: (47.625 - Math.cos(BRANCH_ANGLE) * 0.625) * IN, // Manual: 3 ft 11 5/8 in
  l4: 72 * IN, // Manual: 6 ft
};
const BRANCH_STUB_LENGTH = 12 * IN; // ASSUMPTION: length of the angled L2/L3 stubs
const L4_SECTION_LENGTH = 14 * IN; // ASSUMPTION: vertical L4 section below its top
// ASSUMPTION: the trunk pipes and internal supports are one solid hexagonal core
// reaching out to where the L2/L3 stubs start and up to the bottom of L4.
const CORE_APOTHEM = BRANCH_TIP_RADIUS - BRANCH_STUB_LENGTH * Math.cos(BRANCH_ANGLE);
const CORE_TOP = TIP_Z.l4 - L4_SECTION_LENGTH;

// --- Coral and algae (Manual 5.7) ---
const CORAL_LENGTH = 11.875 * IN; // Manual 5.7.1: 11 7/8 in
const CORAL_RADIUS = (4.5 * IN) / 2; // Manual 5.7.1: 4 1/2 in outside diameter
const CORAL_MASS = 0.65; // Manual 5.7.1: 1.1-1.8 lb (~0.5-0.8 kg); midpoint
const ALGAE_RADIUS = (16 * IN) / 2; // Manual 5.7.2: 16 in +/- 1/2 in diameter
const ALGAE_MASS = 0.68; // ASSUMPTION: about 1.5 lb; the manual gives no weight

// --- Coral stations (Manual 5.6.2; 6328 CoralStation) ---
const STATION_FACE = { x: 33.526 * IN, y: 25.824 * IN, yaw: (144.011 - 90) * DEG }; // 6328 right station
const STATION_LENGTH = 79.75 * IN; // 6328 stationLength
const STATION_DEPTH = 12 * IN; // ASSUMPTION: solid structure behind the face
const STATION_HEIGHT = (36.75 + 42) * IN; // ASSUMPTION: as tall as a DRIVER STATION (Manual 5.6.1)
const STATION_OPENING_BOTTOM = 37.5 * IN; // Manual 5.6.2: 3 ft 1 1/2 in off the carpet
const STATION_OPENING_HEIGHT = 7 * IN; // Manual 5.6.2: 7 in tall
const CHUTE_ANGLE = 55 * DEG; // Manual 5.6.2: 55 degree CHUTE
const CHUTE_EXIT_SPEED = 1.5; // ASSUMPTION: coral sliding out of the chute, m/s
const CORAL_FEED_SECONDS = 1.0; // ASSUMPTION: human player drops one coral per second

// --- Processor (Manual 5.5; WPILib tag 16) ---
const PROCESSOR_X = 5.9875; // WPILib tag 16 (6328 Processor.centerFace)
const PROCESSOR_OPENING_WIDTH = 28 * IN; // Manual 5.5: 2 ft 4 in
const PROCESSOR_OPENING_BOTTOM = 7 * IN; // Manual 5.5: 7 in from the carpet
const PROCESSOR_OPENING_HEIGHT = 20 * IN; // Manual 5.5: 1 ft 8 in
const PROCESSOR_AREA_WIDTH = 43.375 * IN; // Manual 5.2: PROCESSOR AREA 3 ft 7 3/8 in wide
const PROCESSOR_WALL_TOP = (45.875 + 10.5) * IN; // Manual 5.8: tag panel at 3 ft 9 7/8 in, 10 1/2 in tall

// --- Barge (Manual 5.4; 6328 Barge) ---
const BARGE_X = L / 2; // Manual 5.4: spans the center of the field (6328 cages at 345.428 in)
const BARGE_DEPTH = 44 * IN; // Manual 5.4: 3 ft 8 in deep
const TRUSS_BOTTOM = 62 * IN; // Manual 5.4: horizontal truss 5 ft 2 in above the carpet
const NET_TOP = 88 * IN; // 6328 netHeight: top edge a shot must clear
const TRUSS_THICKNESS = 4 * IN; // ASSUMPTION
const CENTER_SUPPORT_WIDTH = 12 * IN; // ASSUMPTION: Manual 5.4 names a center vertical truss, no size
const NET_WIDTH = 40 * IN; // 6328 netWidth (Manual 5.4.2: 4 ft net including its border)
const NET_LENGTH = 144 * IN; // Manual 5.4.2: 12 ft
const NET_LOW_POINT = 76 * IN; // Manual 5.4.2: lowest point 6 ft 4 in above the carpet
const CAGE_Y = [199.947, 242.855, 286.779].map((y) => y * IN); // 6328 close/middle/far cage
const CAGE_WIDTH = 7.375 * IN; // Manual 5.4.1: 7 3/8 in outside
const CAGE_HEIGHT = 24 * IN; // Manual 5.4.1: 2 ft tall
const CAGE_BOTTOM = 3.5 * IN; // Manual 5.4.1 (deep CAGE; see SOURCES.md about the ordering)

// --- Staging (Manual 6.3.4; 6328 StagingPositions) ---
const MARK_X = 48 * IN; // 6328: coral mark ("ice cream") centers
const MARK_SPACING = 72 * IN; // 6328: separation between marks

// --- Helpers ---
const v3 = (a) => a.map(r);
const rot = (a) => a.map(r);
const mirrorPoint = ([x, y, z]) => [L - x, W - y, z];
const mirrorRotation = ([roll, pitch, yaw]) => [roll, pitch, yaw + Math.PI];
const dir = (yaw) => [Math.cos(yaw), Math.sin(yaw)];

/** Blue and red copies of a shape or box; red is rotated 180 degrees about the field center. */
const both = (center, rotation) => ({
  blue: { center: v3(center), rotation: rotation ? rot(rotation) : undefined },
  red: {
    center: v3(mirrorPoint(center)),
    rotation: rotation ? rot(mirrorRotation(rotation)) : undefined,
  },
});
const withRotation = (o, rotation) => (rotation ? { ...o, rotation } : o);

const obstacles = [];
const addObstacle = (id, center, size, rotation, extra = {}) => {
  const copies = both(center, rotation);
  for (const alliance of ['blue', 'red']) {
    const c = copies[alliance];
    obstacles.push({
      id: `${alliance}-${id}`,
      shape: withRotation({ kind: 'box', center: c.center, size: v3(size) }, c.rotation),
      ...extra,
    });
  }
};

const goals = [];
const addGoal = (id, center, size, rotation, extra = {}) => {
  const copies = both(center, rotation);
  for (const alliance of ['blue', 'red']) {
    const c = copies[alliance];
    goals.push({
      id: `${alliance}-${id}`,
      box: withRotation({ center: c.center, size: v3(size) }, c.rotation),
      creditAlliance: alliance,
      ...extra,
    });
  }
};

// Reef base and core: regular hexagons made of three boxes rotated 60 degrees apart.
for (const k of [0, 1, 2]) {
  addObstacle(
    `reef-base-${k}`,
    [REEF_X, REEF_Y, TROUGH_EDGE_Z / 2],
    [REEF_FACE_TO_FACE, REEF_SIDE, TROUGH_EDGE_Z],
    [0, 0, k * 60 * DEG],
  );
  const coreHeight = CORE_TOP - TROUGH_EDGE_Z;
  addObstacle(
    `reef-core-${k}`,
    [REEF_X, REEF_Y, TROUGH_EDGE_Z + coreHeight / 2],
    [2 * CORE_APOTHEM, (2 * CORE_APOTHEM) / Math.sqrt(3), coreHeight],
    [0, 0, k * 60 * DEG],
  );
}

// Faces in 6328's order: face 0 looks at the alliance wall (tag 18), then clockwise.
const faces = [0, 1, 2, 3, 4, 5].map((i) => ({ i, yaw: (180 - 60 * i) * DEG }));
const levelPitch = { l2: -BRANCH_ANGLE, l3: -BRANCH_ANGLE, l4: -90 * DEG }; // WPILib pitch sign
const goalIds = { l1: [], l2: [], l3: [], l4: [] };
const BRANCH_GOAL_ALONG = 9 * IN; // ASSUMPTION: from 1 in inside the branch end to 8 in beyond it
const BRANCH_GOAL_ACROSS = 5 * IN; // ASSUMPTION: about one coral diameter

for (const { i, yaw } of faces) {
  const [nx, ny] = dir(yaw);
  const [tx, ty] = [-ny, nx]; // along the face, to the left when looking out from the reef

  // L1 trough: the strip on top of the base along this face (Manual 5.3, 6.5.1).
  const troughDepth = 8 * IN; // ASSUMPTION
  const troughR = REEF_FACE_TO_FACE / 2 - troughDepth / 2;
  const troughId = `reef-l1-face${i}`;
  addGoal(
    troughId,
    [REEF_X + nx * troughR, REEF_Y + ny * troughR, TROUGH_EDGE_Z + 3.5 * IN],
    [troughDepth, REEF_SIDE, 7 * IN],
    [0, 0, yaw],
  );
  goalIds.l1.push(troughId);

  for (const [side, s] of [
    ['right', 1],
    ['left', -1],
  ]) {
    // 6328 calls +y in the outward frame "right" (the driver's right when facing the reef).
    const tipX = REEF_X + nx * BRANCH_TIP_RADIUS + tx * s * (PIPE_SPACING / 2);
    const tipY = REEF_Y + ny * BRANCH_TIP_RADIUS + ty * s * (PIPE_SPACING / 2);
    for (const level of ['l2', 'l3', 'l4']) {
      const pitch = levelPitch[level];
      const axis = [Math.cos(-pitch) * nx, Math.cos(-pitch) * ny, Math.sin(-pitch)];
      const tip = [tipX, tipY, TIP_Z[level]];
      const length = level === 'l4' ? L4_SECTION_LENGTH : BRANCH_STUB_LENGTH;
      const rotation = [0, pitch, yaw];
      addObstacle(
        `reef-${level}-face${i}-${side}`,
        tip.map((t, k) => t - (axis[k] * length) / 2),
        [length, PIPE_OD, PIPE_OD],
        rotation,
      );
      // Scoring volume at the branch end: a coral whose center reaches it is scored.
      const offset = BRANCH_GOAL_ALONG / 2 - 1 * IN;
      const id = `reef-${level}-face${i}-${side}`;
      addGoal(
        id,
        tip.map((t, k) => t + axis[k] * offset),
        [BRANCH_GOAL_ALONG, BRANCH_GOAL_ACROSS, BRANCH_GOAL_ACROSS],
        rotation,
        { capacity: 1 }, // Manual 6.5.1: one CORAL per BRANCH end
      );
      goalIds[level].push(id);
    }
  }
}

// Coral stations: one in each corner, the field-facing wall angled across it.
const stations = [
  { name: 'right', x: STATION_FACE.x, y: STATION_FACE.y, yaw: STATION_FACE.yaw, supply: 29 },
  { name: 'left', x: STATION_FACE.x, y: W - STATION_FACE.y, yaw: -STATION_FACE.yaw, supply: 28 },
];
const humanPlayerStations = [];
for (const station of stations) {
  const [nx, ny] = dir(station.yaw);
  addObstacle(
    `coral-station-${station.name}`,
    [
      station.x - (nx * STATION_DEPTH) / 2,
      station.y - (ny * STATION_DEPTH) / 2,
      STATION_HEIGHT / 2,
    ],
    [STATION_DEPTH, STATION_LENGTH, STATION_HEIGHT],
    [0, 0, station.yaw],
  );
  // Coral comes out of the opening lying across it (axis along the wall),
  // sliding down the chute direction.
  const exitCenter = [
    station.x + nx * 0.25,
    station.y + ny * 0.25,
    STATION_OPENING_BOTTOM + STATION_OPENING_HEIGHT / 2,
  ];
  const horizontal = CHUTE_EXIT_SPEED * Math.cos(CHUTE_ANGLE);
  const velocity = [nx * horizontal, ny * horizontal, -CHUTE_EXIT_SPEED * Math.sin(CHUTE_ANGLE)];
  const rotation = [Math.PI / 2, 0, station.yaw];
  const copies = both(exitCenter, rotation);
  for (const alliance of ['blue', 'red']) {
    const sign = alliance === 'blue' ? 1 : -1;
    humanPlayerStations.push({
      id: `${alliance}-coral-station-${station.name}`,
      alliance,
      pieceType: 'coral',
      // Manual 6.3.4.1: 57-60 coral per alliance split behind its two stations
      // (57 when all three robots preload one).
      supply: station.supply,
      feedSeconds: CORAL_FEED_SECONDS,
      exit: {
        box: { center: copies[alliance].center, size: v3([0.2, 0.2, 0.02]) },
        velocity: v3([sign * velocity[0], sign * velocity[1], velocity[2]]),
        rotation: copies[alliance].rotation,
      },
    });
  }
}

// Processor: a goal in front of the opening in the guardrail at y = 0 (blue).
// The ball's center must be high enough for the 16 in ball to fit the 7-27 in opening.
const processorBottom = PROCESSOR_OPENING_BOTTOM + 5 * IN; // ASSUMPTION: ball lifted ~5 in
const processorTop = PROCESSOR_OPENING_BOTTOM + PROCESSOR_OPENING_HEIGHT;
addGoal(
  'processor',
  [PROCESSOR_X, 5 * IN, (processorBottom + processorTop) / 2],
  [PROCESSOR_OPENING_WIDTH, 10 * IN, processorTop - processorBottom],
);
const processorWallHeight = PROCESSOR_WALL_TOP - processorTop;
addObstacle(
  'processor-wall',
  [PROCESSOR_X, -0.05, processorTop + processorWallHeight / 2],
  [PROCESSOR_AREA_WIDTH, 0.1, processorWallHeight],
);

// Barge: two horizontal trusses across the field, a center support, and three
// cages per alliance hanging at the deep position (the start-of-day default, Manual 6.3.5).
const trussHeight = NET_TOP - TRUSS_BOTTOM;
for (const [name, sign] of [
  ['blue-side', -1],
  ['red-side', 1],
]) {
  obstacles.push({
    id: `barge-truss-${name}`,
    shape: {
      kind: 'box',
      center: v3([
        BARGE_X + sign * (BARGE_DEPTH / 2 - TRUSS_THICKNESS / 2),
        W / 2,
        TRUSS_BOTTOM + trussHeight / 2,
      ]),
      size: v3([TRUSS_THICKNESS, W, trussHeight]),
    },
  });
}
obstacles.push({
  id: 'barge-center-support',
  shape: {
    kind: 'box',
    center: v3([BARGE_X, W / 2, TRUSS_BOTTOM / 2]),
    size: v3([BARGE_DEPTH, CENTER_SUPPORT_WIDTH, TRUSS_BOTTOM]),
  },
});
CAGE_Y.forEach((y, k) => {
  addObstacle(
    `cage-${k + 1}`,
    [BARGE_X, y, CAGE_BOTTOM + CAGE_HEIGHT / 2],
    [CAGE_WIDTH, CAGE_WIDTH, CAGE_HEIGHT],
  );
});

// Net: algae is scored when it is above the net and inside its perimeter
// (Manual 6.5.1). ASSUMPTION: the net is centered over the alliance's middle cage.
const netBottom = NET_LOW_POINT + ALGAE_RADIUS; // a ball resting in the net
const netGoalTop = 100 * IN; // ASSUMPTION: just under the 8 ft 5 in barge top
addGoal(
  'net',
  [BARGE_X, CAGE_Y[1], (netBottom + netGoalTop) / 2],
  [NET_WIDTH, NET_LENGTH, netGoalTop - netBottom],
);

// Staging (Manual 6.3.4): a coral standing on each mark with an algae on top,
// and 6 algae per reef resting on pairs of branches.
const pieceSpawns = [];
const spawnBoth = (type, position, rotation) => {
  pieceSpawns.push({ type, position: v3(position), ...(rotation ? { rotation } : {}) });
  pieceSpawns.push({ type, position: v3(mirrorPoint(position)) });
};
for (const k of [-1, 0, 1]) {
  const y = W / 2 + k * MARK_SPACING;
  spawnBoth('coral', [MARK_X, y, CORAL_LENGTH / 2 + 0.002]);
  spawnBoth('algae', [MARK_X, y, CORAL_LENGTH + ALGAE_RADIUS + 0.004]);
}
// Reef algae (Manual 6.3.4.2, Figure 6-3). 6328 AlgaeObjective: odd faces are low
// (on the L2 branches), even faces high (on the L3 branches). Each ball sits
// against the core, cradled by the pair of stubs.
const algaeR = CORE_APOTHEM + ALGAE_RADIUS + 0.2 * IN;
const cradle = Math.sqrt((ALGAE_RADIUS + PIPE_OD / 2) ** 2 - (PIPE_SPACING / 2) ** 2);
for (const { i, yaw } of faces) {
  const level = i % 2 === 1 ? 'l2' : 'l3';
  const stubZ = TIP_Z[level] - (BRANCH_TIP_RADIUS - algaeR) * Math.tan(BRANCH_ANGLE);
  const [nx, ny] = dir(yaw);
  spawnBoth('algae', [REEF_X + nx * algaeR, REEF_Y + ny * algaeR, stubZ + cradle + 0.1 * IN]);
}

// Zones (Manual 5.2): display only for now.
const zones = [
  {
    id: 'blue-side',
    kind: 'allianceZone',
    alliance: 'blue',
    box: { center: v3([L / 4, W / 2, 1]), size: v3([L / 2, W, 2]) },
  },
  {
    id: 'red-side',
    kind: 'allianceZone',
    alliance: 'red',
    box: { center: v3([(3 * L) / 4, W / 2, 1]), size: v3([L / 2, W, 2]) },
  },
  {
    // Manual 5.2: BARGE ZONE 3 ft 10 in deep by 12 ft 2 1/2 in long around the alliance's half
    id: 'blue-barge-zone',
    kind: 'other',
    alliance: 'blue',
    box: { center: v3([BARGE_X, W / 2 + (146.5 * IN) / 2, 1]), size: v3([46 * IN, 146.5 * IN, 2]) },
  },
  {
    id: 'red-barge-zone',
    kind: 'other',
    alliance: 'red',
    box: { center: v3([BARGE_X, W / 2 - (146.5 * IN) / 2, 1]), size: v3([46 * IN, 146.5 * IN, 2]) },
  },
];

const points = (auto, teleop) => ({ auto, teleop });
const scoring = [];
for (const alliance of ['blue', 'red']) {
  const ids = (list) => list.map((id) => `${alliance}-${id}`);
  // Manual Table 6-2.
  scoring.push(
    {
      id: `${alliance}-coral-l1`,
      when: 'pieceEntersGoal',
      goals: ids(goalIds.l1),
      pieceTypes: ['coral'],
      points: points(3, 2),
    },
    {
      id: `${alliance}-coral-l2`,
      when: 'pieceEntersGoal',
      goals: ids(goalIds.l2),
      pieceTypes: ['coral'],
      points: points(4, 3),
    },
    {
      id: `${alliance}-coral-l3`,
      when: 'pieceEntersGoal',
      goals: ids(goalIds.l3),
      pieceTypes: ['coral'],
      points: points(6, 4),
    },
    {
      id: `${alliance}-coral-l4`,
      when: 'pieceEntersGoal',
      goals: ids(goalIds.l4),
      pieceTypes: ['coral'],
      points: points(7, 5),
    },
    {
      id: `${alliance}-algae-processor`,
      when: 'pieceEntersGoal',
      goals: [`${alliance}-processor`],
      pieceTypes: ['algae'],
      points: points(6, 6),
    },
    {
      id: `${alliance}-algae-net`,
      when: 'pieceEntersGoal',
      goals: [`${alliance}-net`],
      pieceTypes: ['algae'],
      points: points(4, 4),
    },
  );
}

const pack = {
  formatVersion: 1,
  id: 'reefscape-2025',
  name: 'REEFSCAPE presented by Haas',
  season: 2025,
  source: {
    manualRevision: '2025 Game Manual as published on frcmanual.com/2025; see SOURCES.md',
    url: 'https://www.firstinspires.org/resources/library/frc/season-materials',
  },
  field: {
    size: [L, W],
    wallHeight: r(GUARDRAIL_HEIGHT),
    // Manual 5.1: Shaw Philadelphia Commercial Neyland II 20, the standard FRC carpet.
    // Omitting `carpet` uses the engine's FRC_CARPET estimates for that exact carpet.
    obstacles,
    goals,
    zones,
    // Manual 6.8: pieces that leave the field (other than algae through the
    // processor) go back "approximately at the point of exit" at the earliest
    // safe opportunity. The delay is an ASSUMPTION.
    outOfBounds: { mode: 'exitPoint', delaySeconds: 3 },
  },
  pieceTypes: [
    {
      id: 'coral',
      name: 'CORAL',
      shape: { kind: 'cylinder', radius: r(CORAL_RADIUS), length: r(CORAL_LENGTH) },
      mass: CORAL_MASS,
      friction: 0.35, // ASSUMPTION: smooth PVC
      restitution: 0.25, // ASSUMPTION: rigid foam-core PVC
    },
    {
      id: 'algae',
      name: 'ALGAE',
      shape: { kind: 'sphere', radius: r(ALGAE_RADIUS) },
      mass: ALGAE_MASS,
      friction: 0.8, // ASSUMPTION: rubber playground ball
      restitution: 0.6, // ASSUMPTION: inflated rubber ball
    },
  ],
  pieceSpawns,
  // Manual 6.3.4.1 B: each robot may preload 1 coral.
  preload: { type: 'coral', maxPerRobot: 1 },
  humanPlayerStations,
  match: {
    // Manual 6.4: AUTO 15 s, TELEOP 2:15.
    periods: [
      { id: 'auto', durationSeconds: 15 },
      { id: 'teleop', durationSeconds: 135 },
    ],
  },
  scoring,
  robotRules: {
    maxFramePerimeter: r(120 * IN), // R104 / Checklist: ROBOT PERIMETER <= 120 in
    maxHeight: r(42 * IN), // R104 / Checklist: STARTING CONFIGURATION <= 3 ft 6 in tall
    maxExtension: r(18 * IN), // R105 / Checklist: <= 1 ft 6 in beyond the ROBOT PERIMETER
    maxMass: 52.16, // R103 / Checklist: <= 115 lb excluding BUMPERS and battery
  },
  mechanics: [],
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
const count = (type) => pieceSpawns.filter((s) => s.type === type).length;
console.log(
  `wrote pack.json: ${obstacles.length} obstacles, ${goals.length} goals, ` +
    `${count('coral')} coral and ${count('algae')} algae staged on the field, ` +
    `${humanPlayerStations.reduce((n, s) => n + s.supply, 0)} coral with human players`,
);
