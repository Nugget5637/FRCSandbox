import { z } from 'zod';
import type { GamePack } from './pack';

/**
 * Robot specification used until the bot creator (Milestone 4) compiles
 * blueprints. It describes capabilities and costs, not internal parts.
 * All values are SI units; angles are radians.
 */
const positive = z.number().positive();

export const RobotSpecSchema = z.object({
  frame: z.object({ length: positive, width: positive, height: positive }),
  mass: positive,
  maxSpeed: positive,
  maxAcceleration: positive,
  maxTurnRate: positive,
  intake: z.object({
    /** How far in front of the frame the intake captures pieces. */
    reach: positive,
    /** Width of the capture area, centered on the robot. */
    width: positive,
    capacity: z.number().int().positive(),
  }),
  release: z.object({
    height: positive,
    speed: z.number().nonnegative(),
    /** Launch angle above horizontal. */
    pitch: z.number(),
  }),
});

export type RobotSpec = z.output<typeof RobotSpecSchema>;

/** One tick of control input for a robot. Drive is field-relative. */
export interface RobotInput {
  /** Desired direction and speed, each axis in [-1, 1]. Clamped to the unit circle. */
  drive: { x: number; y: number };
  /** Turn rate command in [-1, 1]. Positive turns counterclockwise. */
  rotate: number;
  /** While true, captures pieces that reach the intake area. */
  intake: boolean;
  /** A release happens once each time this changes from false to true. */
  release: boolean;
}

export const IDLE_INPUT: RobotInput = Object.freeze({
  drive: Object.freeze({ x: 0, y: 0 }),
  rotate: 0,
  intake: false,
  release: false,
});

export interface RuleViolation {
  rule: 'maxFramePerimeter' | 'maxHeight' | 'maxMass';
  limit: number;
  actual: number;
}

/** Checks a robot against a pack's robot rules. Returns an empty list if legal. */
export function checkRobotRules(spec: RobotSpec, rules: GamePack['robotRules']): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const perimeter = 2 * (spec.frame.length + spec.frame.width);
  if (perimeter > rules.maxFramePerimeter) {
    violations.push({
      rule: 'maxFramePerimeter',
      limit: rules.maxFramePerimeter,
      actual: perimeter,
    });
  }
  if (spec.frame.height > rules.maxHeight) {
    violations.push({ rule: 'maxHeight', limit: rules.maxHeight, actual: spec.frame.height });
  }
  if (spec.mass > rules.maxMass) {
    violations.push({ rule: 'maxMass', limit: rules.maxMass, actual: spec.mass });
  }
  return violations;
}
