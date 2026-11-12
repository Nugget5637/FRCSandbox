/**
 * Registry of season-specific mechanic modules.
 *
 * Game packs are data and cannot run code. When a season introduces a mechanic
 * that the pack format cannot express (for example, goals that switch between
 * active and inactive), it is implemented here as reviewed engine code and a
 * pack enables it by id in its `mechanics` list.
 *
 * Milestone 1 defines the registry and validation only. No modules exist yet.
 */
export interface MechanicModule {
  readonly id: string;
  readonly description: string;
}

const registry = new Map<string, MechanicModule>();

export function getMechanic(id: string): MechanicModule | undefined {
  return registry.get(id);
}

export function knownMechanicIds(): string[] {
  return [...registry.keys()].sort();
}
