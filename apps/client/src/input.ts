import type { RobotInput } from '@frcsandbox/sim';
import type { ControlFrame } from './render/cameras';

/**
 * Turns keyboard, gamepad, and on-screen touch controls into one RobotInput.
 *
 * Drive is produced in the player's frame of reference and then rotated into
 * field coordinates for the engine. In the robot-relative frame (chase camera),
 * "forward" means the way the robot faces; in the field frame, "forward" means
 * downfield (+x), the way a driver behind the blue wall sees it.
 */
/** Keys the game consumes, so the browser shouldn't act on them (Tab, Space, arrows). */
const GAME_KEYS = new Set([
  'Tab',
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyJ',
  'KeyK',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly touch = { x: 0, y: 0, rotate: 0, intake: false, release: false };
  touchActive = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keys.add(e.code);
      // Stop the browser's default handling of game keys. Tab is the important
      // one: without this it moves focus off the canvas and keystrokes stop
      // reaching the game until the player clicks back in.
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** True once for a key press, consuming it (for toggles like Tab). */
  pressed(code: string): boolean {
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }

  setTouch(state: Partial<typeof this.touch>): void {
    Object.assign(this.touch, state);
    this.touchActive = true;
  }

  sample(frame: ControlFrame, robotYaw: number): RobotInput {
    const pad = navigator.getGamepads?.().find((g) => g);
    let x = this.axis('KeyW', 'KeyS');
    let y = this.axis('KeyA', 'KeyD');
    let rotate = this.axis('KeyQ', 'KeyE');
    let intake = this.held('KeyJ');
    let release = this.held('KeyK');

    if (pad) {
      x += -deadzone(pad.axes[1] ?? 0);
      y += -deadzone(pad.axes[0] ?? 0);
      rotate += -deadzone(pad.axes[2] ?? 0);
      intake ||= (pad.buttons[6]?.value ?? 0) > 0.5 || !!pad.buttons[4]?.pressed;
      release ||= (pad.buttons[7]?.value ?? 0) > 0.5 || !!pad.buttons[5]?.pressed;
    }
    if (this.touchActive) {
      x += this.touch.x;
      y += this.touch.y;
      rotate += this.touch.rotate;
      intake ||= this.touch.intake;
      release ||= this.touch.release;
    }

    // Player-frame drive: x is forward, y is left. Convert to field coordinates.
    let fieldX: number;
    let fieldY: number;
    if (frame === 'robot') {
      const cos = Math.cos(robotYaw);
      const sin = Math.sin(robotYaw);
      fieldX = x * cos - y * sin;
      fieldY = x * sin + y * cos;
    } else {
      fieldX = x; // downfield is +x
      fieldY = y;
    }
    return { drive: { x: fieldX, y: fieldY }, rotate, intake, release };
  }

  private axis(positive: string, negative: string): number {
    return (this.held(positive) ? 1 : 0) - (this.held(negative) ? 1 : 0);
  }
}

function deadzone(v: number): number {
  return Math.abs(v) < 0.12 ? 0 : v;
}
