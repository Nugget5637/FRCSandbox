/**
 * @frcsandbox/sim — headless simulation engine.
 *
 * This package must stay free of DOM, rendering, and browser APIs so the same
 * code can run in tests, Web Workers, and the browser. Its tsconfig omits the
 * DOM lib to enforce that at compile time.
 *
 * Milestone 0 only establishes the package boundary and shared conventions.
 * The engine itself (fixed-timestep loop, state, scoring) arrives in Milestone 1.
 */

export const ENGINE_VERSION = '0.0.0';

/**
 * Units and coordinates used everywhere in the engine and in game packs.
 * See docs/PLAN.md, "Conventions".
 */
export const UNITS = {
  length: 'm',
  mass: 'kg',
  time: 's',
  angle: 'rad',
} as const;

/**
 * Simulation rate. The engine advances in fixed steps of this size regardless
 * of the display frame rate. Rendering interpolates between steps.
 */
export const SIM_HZ = 60;
export const SIM_STEP_SECONDS = 1 / SIM_HZ;
