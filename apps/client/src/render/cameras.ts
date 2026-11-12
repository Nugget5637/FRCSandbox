import * as THREE from 'three';
import type { GamePack, RobotSnapshot } from '@frcsandbox/sim';

/**
 * The three driver cameras for Milestone 3.
 *
 * - chase: locked behind the robot, turns with it (robot-relative driving).
 * - broadcast: from behind the blue alliance wall, high and angled down,
 *   follows the robot and zooms between two levels when it crosses the
 *   alliance-zone line, with a quartic ease-out (field-relative driving).
 * - station: eye height at a driver station, looking across the field
 *   (field-relative driving).
 *
 * +x runs blue -> red, +y to the left of the blue driver, +z up (WPILib).
 */
export type CameraMode = 'chase' | 'broadcast' | 'station';
export const CAMERA_MODES: CameraMode[] = ['chase', 'broadcast', 'station'];

/** Each camera's natural control frame. */
export type ControlFrame = 'robot' | 'field';
export const CONTROL_FRAME: Record<CameraMode, ControlFrame> = {
  chase: 'robot',
  broadcast: 'field',
  station: 'field',
};

export interface CameraInputs {
  pack: GamePack;
  robot: RobotSnapshot;
  /** Seconds since the previous frame, used for smoothing. */
  dt: number;
}

const EASE_POWER = 4; // quartic ease-out: fast jolt, then brakes to a stop
const ZOOM_SECONDS = 1;
const LINE_HYSTERESIS = 0.3; // meters past the line before the zoom switches back

function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, EASE_POWER);
}

function damp(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): void {
  // Framerate-independent exponential smoothing.
  const factor = 1 - Math.exp(-lambda * dt);
  current.lerp(target, factor);
}

export class DriverCameras {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'broadcast';
  private station = 1; // 1, 2, or 3

  private readonly chasePos = new THREE.Vector3();
  private readonly chaseTarget = new THREE.Vector3();
  private readonly broadcastTarget = new THREE.Vector3();

  // Broadcast zoom: 0 = pulled back (robot in its own zone), 1 = zoomed in.
  private zoomLevel = 0;
  private zoomFrom = 0;
  private zoomElapsed = ZOOM_SECONDS;
  private zoomedIn = false;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  get controlFrame(): ControlFrame {
    return CONTROL_FRAME[this.mode];
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Tab cycles chase -> broadcast -> station -> station 2 -> station 3 -> chase. */
  cycle(): void {
    if (this.mode === 'station' && this.station < 3) {
      this.station += 1;
    } else {
      const next = (CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length;
      this.mode = CAMERA_MODES[next]!;
      if (this.mode === 'station') this.station = 1;
    }
    this.initialized = false;
  }

  label(): string {
    return this.mode === 'station' ? `driver station ${this.station}` : this.mode;
  }

  update({ pack, robot, dt }: CameraInputs): void {
    const [length, width] = pack.field.size;
    const robotPos = new THREE.Vector3(robot.pose.x, robot.pose.y, robot.pose.z);

    if (this.mode === 'chase') this.updateChase(robotPos, robot.pose.yaw, dt);
    else if (this.mode === 'broadcast') this.updateBroadcast(robotPos, pack, dt);
    else this.updateStation(robotPos, length, width);

    this.initialized = true;
  }

  private updateChase(robotPos: THREE.Vector3, yaw: number, dt: number): void {
    const behind = 2.5;
    const up = 1.5;
    const target = new THREE.Vector3(
      robotPos.x - Math.cos(yaw) * behind,
      robotPos.y - Math.sin(yaw) * behind,
      robotPos.z + up,
    );
    const look = new THREE.Vector3(robotPos.x, robotPos.y, robotPos.z + 0.3);
    if (!this.initialized) {
      this.chasePos.copy(target);
      this.chaseTarget.copy(look);
    } else {
      damp(this.chasePos, target, 10, dt);
      damp(this.chaseTarget, look, 15, dt);
    }
    this.camera.position.copy(this.chasePos);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this.chaseTarget);
  }

  private updateBroadcast(robotPos: THREE.Vector3, pack: GamePack, dt: number): void {
    // Blue alliance zone depth: the first allianceZone zone, else a sensible default.
    const zone = pack.field.zones.find((z) => z.kind === 'allianceZone' && z.alliance === 'blue');
    const lineX = zone ? zone.box.center[0] + zone.box.size[0] / 2 : pack.field.size[0] * 0.25;

    // Switch zoom level when the robot crosses the line, with hysteresis.
    const wantZoomIn = this.zoomedIn
      ? robotPos.x > lineX - LINE_HYSTERESIS
      : robotPos.x > lineX + LINE_HYSTERESIS;
    if (wantZoomIn !== this.zoomedIn) {
      this.zoomedIn = wantZoomIn;
      this.zoomFrom = this.zoomLevel;
      this.zoomElapsed = 0;
    }
    if (this.zoomElapsed < ZOOM_SECONDS) {
      this.zoomElapsed = Math.min(ZOOM_SECONDS, this.zoomElapsed + dt);
      const goal = this.zoomedIn ? 1 : 0;
      this.zoomLevel =
        this.zoomFrom + (goal - this.zoomFrom) * easeOut(this.zoomElapsed / ZOOM_SECONDS);
    }

    // Fixed point high above field center. The position never moves; the camera
    // only rotates (via lookAt) to track the robot, so the whole field stays in
    // view and the robot is always framed. Zoom eases the height between two
    // values when the robot crosses the alliance line.
    const [length, width] = pack.field.size;
    const height = lerp(13, 9, this.zoomLevel);
    this.camera.position.set(length / 2, width / 2, height);
    this.camera.up.set(0, 0, 1);

    const look = new THREE.Vector3(robotPos.x, robotPos.y, robotPos.z);
    if (!this.initialized) {
      this.broadcastTarget.copy(look);
    } else {
      damp(this.broadcastTarget, look, 8, dt);
    }
    this.camera.lookAt(this.broadcastTarget);
  }

  private updateStation(robotPos: THREE.Vector3, length: number, width: number): void {
    // Behind the blue wall at x = 0, at one of three station y positions, eye height.
    const y = width * [0.2, 0.5, 0.8][this.station - 1]!;
    this.camera.position.set(-0.6, y, 1.7);
    this.camera.up.set(0, 0, 1);
    // Look at the robot but keep the horizon roughly level by aiming downfield.
    this.camera.lookAt(new THREE.Vector3(Math.max(robotPos.x, length * 0.35), robotPos.y, 0.4));
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
