export const ENGINE_VERSION = '0.1.0';

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
