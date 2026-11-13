/**
 * @frcsandbox/sim — headless, season-agnostic 3D simulation engine.
 *
 * This package must stay free of DOM, rendering, and browser APIs so the same
 * code can run in tests, Web Workers, and the browser. Its tsconfig omits the
 * DOM lib to enforce that at compile time.
 */

export { ENGINE_VERSION, SIM_HZ, SIM_STEP_SECONDS, UNITS } from './constants';
export {
  AllianceSchema,
  DEFAULT_OUT_OF_BOUNDS,
  DEFAULT_STRUCTURE_SURFACE,
  IDENTITY_QUATERNION,
  FRC_CARPET,
  GamePackError,
  GamePackSchema,
  boxContains,
  loadGamePack,
  pointsFor,
  rotateVector,
  rotationToQuaternion,
  type Alliance,
  type Box,
  type HumanPlayerStation,
  type Obstacle,
  type OrientedBox,
  type OutOfBounds,
  type PieceExit,
  type Quaternion,
  type Rotation,
  type Carpet,
  type Surface,
  type GamePack,
  type Goal,
  type ObstacleShape,
  type PieceShape,
  type ScoringRule,
  type Zone,
} from './pack';
export {
  IDLE_INPUT,
  RobotSpecSchema,
  checkRobotRules,
  type RobotInput,
  type RobotSpec,
  type RuleViolation,
} from './robot';
export { SeededRandom } from './rng';
export {
  DEMO_ROBOT,
  DEMO_ROBOT_SPEC,
  createDemoController,
  demoArena,
  type DemoController,
  type DemoPhase,
} from './demo/demo';
export { getMechanic, knownMechanicIds, type MechanicModule } from './mechanics';
export {
  DEFAULT_ANGULAR_ACCELERATION,
  GRAVITY,
  Simulation,
  combineSurfaces,
  createSimulation,
  initPhysics,
  type GoalSnapshot,
  type HumanPlayerInput,
  type PieceSnapshot,
  type PieceState,
  type RobotEntry,
  type RobotSnapshot,
  type SimEvent,
  type SimSnapshot,
  type SimulationOptions,
  type StationSnapshot,
} from './simulation';
