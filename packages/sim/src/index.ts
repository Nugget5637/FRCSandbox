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
  GamePackError,
  GamePackSchema,
  boxContains,
  loadGamePack,
  pointsFor,
  type Alliance,
  type Box,
  type GamePack,
  type PieceShape,
  type ScoringRule,
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
export { getMechanic, knownMechanicIds, type MechanicModule } from './mechanics';
export {
  GRAVITY,
  Simulation,
  createSimulation,
  initPhysics,
  type PieceSnapshot,
  type PieceState,
  type RobotEntry,
  type RobotSnapshot,
  type SimEvent,
  type SimSnapshot,
  type SimulationOptions,
} from './simulation';
