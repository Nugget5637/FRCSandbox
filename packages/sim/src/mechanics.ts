import type { Alliance, GamePack, Goal } from './pack';
import type { SeededRandom } from './rng';
import { rebuiltHubShifts } from './mechanics/rebuilt-hub-shifts';

/**
 * Registry of season-specific mechanic modules.
 *
 * Game packs are data and cannot run code. When a season introduces a mechanic
 * the pack format cannot express, it is implemented here as reviewed engine
 * code and a pack enables it by id in its `mechanics` list.
 */

/** Match state passed to mechanic hooks. */
export interface MechanicContext {
  readonly tick: number;
  readonly period: string;
  readonly previousPeriod: string | null;
  readonly ticksIntoPeriod: number;
  readonly random: SeededRandom;
}

export interface PieceScoredInfo {
  readonly goal: Goal;
  readonly alliance: Alliance;
  readonly pieceType: string;
  readonly active: boolean;
}

/** Per-match state for one mechanic. Every hook is optional. */
export interface MechanicInstance {
  /** Return false to make a goal inactive: pieces still enter it but score 0 points. */
  isGoalActive?(goal: Goal, context: MechanicContext): boolean;
  onPieceScored?(info: PieceScoredInfo, context: MechanicContext): void;
}

export interface MechanicModule {
  readonly id: string;
  readonly description: string;
  /** Returns problems that make the pack incompatible with this mechanic. */
  validate?(pack: GamePack): string[];
  create(pack: GamePack): MechanicInstance;
}

const registry = new Map<string, MechanicModule>([[rebuiltHubShifts.id, rebuiltHubShifts]]);

export function getMechanic(id: string): MechanicModule | undefined {
  return registry.get(id);
}

export function knownMechanicIds(): string[] {
  return [...registry.keys()].sort();
}
