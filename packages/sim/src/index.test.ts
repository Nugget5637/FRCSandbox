import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, SIM_HZ, SIM_STEP_SECONDS, UNITS } from './index';

describe('sim package skeleton', () => {
  it('exposes a version string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses SI units and radians', () => {
    expect(UNITS).toEqual({ length: 'm', mass: 'kg', time: 's', angle: 'rad' });
  });

  it('defines a fixed step consistent with the simulation rate', () => {
    expect(SIM_STEP_SECONDS * SIM_HZ).toBeCloseTo(1, 12);
  });
});
