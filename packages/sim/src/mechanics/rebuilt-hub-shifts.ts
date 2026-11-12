import { SIM_HZ } from '../constants';
import type { MechanicContext, MechanicModule } from '../mechanics';
import type { Alliance, GamePack } from '../pack';

/**
 * REBUILT (2026) hub shifts.
 *
 * Source: 2026 Game Manual section 6.4 (Table 6-2 match shifts, Table 6-3 hub
 * status, section 6.4.1). Both hubs are active during AUTO, the TRANSITION
 * SHIFT, and END GAME. During ALLIANCE SHIFTS 1-4 only one hub is active. The
 * alliance that scored more FUEL in AUTO has its hub inactive in SHIFT 1, and
 * the hubs alternate each shift after that. A tie is broken randomly. FUEL is
 * still assessed for 3 seconds after a hub deactivates or AUTO ends.
 */

export const REBUILT_PERIODS = [
  'auto',
  'transition',
  'shift-1',
  'shift-2',
  'shift-3',
  'shift-4',
  'endgame',
] as const;

const ALWAYS_ACTIVE = new Set(['auto', 'transition', 'endgame']);
const SHIFT_NUMBER: Record<string, number> = {
  'shift-1': 1,
  'shift-2': 2,
  'shift-3': 3,
  'shift-4': 4,
};
/** Manual 6.5: assessment continues for 3 seconds after deactivation or AUTO ends. */
export const HUB_GRACE_TICKS = 3 * SIM_HZ;

const other = (alliance: Alliance): Alliance => (alliance === 'red' ? 'blue' : 'red');

export const rebuiltHubShifts: MechanicModule = {
  id: 'rebuilt-hub-shifts',
  description:
    'REBUILT hubs alternate between active and inactive during alliance shifts, starting from the AUTO result.',

  validate(pack: GamePack): string[] {
    const problems: string[] = [];
    const periods = pack.match.periods.map((p) => p.id);
    if (periods.join(',') !== REBUILT_PERIODS.join(',')) {
      problems.push(`match periods must be ${REBUILT_PERIODS.join(', ')} in that order`);
    }
    for (const alliance of ['red', 'blue'] as const) {
      const count = pack.field.goals.filter((g) => g.creditAlliance === alliance).length;
      if (count !== 1) problems.push(`expected exactly one ${alliance} hub goal, found ${count}`);
    }
    return problems;
  },

  create() {
    const autoFuel: Record<Alliance, number> = { red: 0, blue: 0 };
    let firstInactive: Alliance | null = null;

    const inactiveIn = (period: string, context: MechanicContext): Alliance | null => {
      const shift = SHIFT_NUMBER[period];
      if (shift === undefined) return null;
      if (firstInactive === null) {
        if (autoFuel.red !== autoFuel.blue) {
          firstInactive = autoFuel.red > autoFuel.blue ? 'red' : 'blue';
        } else {
          firstInactive = context.random.next() < 0.5 ? 'red' : 'blue';
        }
      }
      return shift % 2 === 1 ? firstInactive : other(firstInactive);
    };

    const activeIn = (alliance: Alliance, period: string, context: MechanicContext): boolean =>
      ALWAYS_ACTIVE.has(period) || inactiveIn(period, context) !== alliance;

    return {
      isGoalActive(goal, context) {
        const alliance = goal.creditAlliance;
        if (activeIn(alliance, context.period, context)) return true;
        return (
          context.previousPeriod !== null &&
          context.ticksIntoPeriod < HUB_GRACE_TICKS &&
          activeIn(alliance, context.previousPeriod, context)
        );
      },

      onPieceScored(info, context) {
        if (!info.active) return;
        const inAuto =
          context.period === 'auto' ||
          (context.period === 'transition' && context.ticksIntoPeriod < HUB_GRACE_TICKS);
        if (inAuto) autoFuel[info.alliance] += 1;
      },
    };
  },
};
