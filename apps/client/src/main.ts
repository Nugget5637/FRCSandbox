import {
  createDemoController,
  createSimulation,
  DEMO_ROBOT,
  DEMO_ROBOT_SPEC,
  demoArena,
  ENGINE_VERSION,
  SIM_HZ,
  SIM_STEP_SECONDS,
  type DemoController,
  type RobotInput,
  type SimEvent,
  type SimSnapshot,
  type Simulation,
} from '@frcsandbox/sim';

/**
 * Temporary top-down debug view of the 3D engine.
 *
 * Draws the demo arena from above and runs the real simulation at a fixed
 * 60 Hz step. The flat drawing is only a window into the engine: the game and
 * bot creator are fully 3D, and the WebGL2 3D view replaces this in Milestone 3.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
const status = document.querySelector<HTMLParagraphElement>('#status');
if (!canvas || !status) throw new Error('Expected #viewport canvas and #status element');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is not available');
const ctx: CanvasRenderingContext2D = context;
const view: HTMLCanvasElement = canvas;

const pack = demoArena();
const [FIELD_LENGTH, FIELD_WIDTH] = pack.field.size;

let sim: Simulation;
let controller: DemoController;
let manual = false;
let paused = false;
let speed = 1;
let accumulator = 0;
let lastFrame = performance.now();
const keys = new Set<string>();

async function restart(): Promise<void> {
  sim?.dispose();
  sim = await createSimulation({ pack, robots: [DEMO_ROBOT], seed: 1 });
  controller = createDemoController();
  accumulator = 0;
}

function manualInput(): RobotInput {
  const axis = (positive: string, negative: string) =>
    (keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0);
  return {
    // Field-relative: W drives toward red (+x), A drives left (+y).
    drive: { x: axis('KeyW', 'KeyS'), y: axis('KeyA', 'KeyD') },
    rotate: axis('KeyQ', 'KeyE'),
    intake: keys.has('KeyJ'),
    release: keys.has('KeyK'),
  };
}

function tick(): void {
  const snapshot = sim.snapshot();
  const robotInput = manual ? manualInput() : controller.next(snapshot);
  sim.step({ [DEMO_ROBOT.id]: robotInput });
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === 'KeyM') manual = !manual;
  if (event.code === 'KeyP' || event.code === 'Space') paused = !paused;
  if (event.code === 'KeyR') void restart();
  if (event.code === 'Digit1') speed = 1;
  if (event.code === 'Digit2') speed = 2;
  if (event.code === 'Digit4') speed = 4;
  if (event.code === 'Space') event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

function frame(now: number): void {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;

  if (!paused && !sim.finished) {
    accumulator += elapsed * speed;
    while (accumulator >= SIM_STEP_SECONDS) {
      tick();
      accumulator -= SIM_STEP_SECONDS;
    }
  }

  draw(sim.snapshot(), sim.getEvents());
  requestAnimationFrame(frame);
}

// ---------- drawing ----------

const HUD_HEIGHT = 150;

function draw(snapshot: SimSnapshot, events: readonly SimEvent[]): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = view.clientWidth;
  const height = view.clientHeight;
  if (view.width !== Math.round(width * dpr) || view.height !== Math.round(height * dpr)) {
    view.width = Math.round(width * dpr);
    view.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, width, height);

  const margin = 24;
  const scale = Math.min(
    (width - margin * 2) / FIELD_LENGTH,
    (height - HUD_HEIGHT - margin * 2) / FIELD_WIDTH,
  );
  const originX = (width - FIELD_LENGTH * scale) / 2;
  const originY = HUD_HEIGHT + margin;
  // Field coordinates: +x right, +y up on screen (WPILib convention viewed from above).
  const toScreen = (x: number, y: number): [number, number] => [
    originX + x * scale,
    originY + (FIELD_WIDTH - y) * scale,
  ];

  drawField(toScreen, scale);
  for (const piece of snapshot.pieces) {
    if (piece.state === 'field' && piece.position) {
      const [sx, sy] = toScreen(piece.position.x, piece.position.y);
      const airborne = piece.position.z > 0.1;
      const radius = Math.max(3, 0.075 * scale) * (airborne ? 1.25 : 1);
      if (airborne) {
        ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
        ctx.beginPath();
        ctx.arc(sx + 4, sy + 4, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const robot of snapshot.robots) drawRobot(robot, toScreen, scale);
  drawHud(snapshot, events, width);
}

function drawField(toScreen: (x: number, y: number) => [number, number], scale: number): void {
  const [x0, y0] = toScreen(0, FIELD_WIDTH);
  ctx.fillStyle = '#1a1f29';
  ctx.fillRect(x0, y0, FIELD_LENGTH * scale, FIELD_WIDTH * scale);
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, FIELD_LENGTH * scale, FIELD_WIDTH * scale);

  const box = (center: number[], size: number[], fill: string, stroke: string) => {
    const [cx = 0, cy = 0] = center;
    const [sx = 0, sy = 0] = size;
    const [left, top] = toScreen(cx - sx / 2, cy + sy / 2);
    ctx.fillStyle = fill;
    ctx.fillRect(left, top, sx * scale, sy * scale);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(left, top, sx * scale, sy * scale);
  };

  for (const obstacle of pack.field.obstacles) {
    box(obstacle.box.center, obstacle.box.size, '#374151', '#6b7280');
  }
  for (const goal of pack.field.goals) {
    const color = goal.creditAlliance === 'blue' ? '59 130 246' : '239 68 68';
    box(goal.box.center, goal.box.size, `rgb(${color} / 0.2)`, `rgb(${color})`);
    const [gx, gy] = toScreen(goal.box.center[0], goal.box.center[1]);
    ctx.fillStyle = `rgb(${color})`;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', gx, gy + 4);
  }
}

function drawRobot(
  robot: SimSnapshot['robots'][number],
  toScreen: (x: number, y: number) => [number, number],
  scale: number,
): void {
  const { frame, intake } = DEMO_ROBOT_SPEC;
  const [sx, sy] = toScreen(robot.pose.x, robot.pose.y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-robot.pose.yaw); // screen y points down, so negate counterclockwise yaw

  const length = frame.length * scale;
  const width = frame.width * scale;
  // Intake capture area in front of the frame.
  ctx.fillStyle = 'rgb(34 197 94 / 0.15)';
  ctx.fillRect(length / 2, (-intake.width * scale) / 2, intake.reach * scale, intake.width * scale);

  ctx.fillStyle = robot.alliance === 'blue' ? '#2563eb' : '#dc2626';
  ctx.fillRect(-length / 2, -width / 2, length, width);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.strokeRect(-length / 2, -width / 2, length, width);
  // Front marker.
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(length / 2 - 4, 0);
  ctx.lineTo(length / 2 - 16, -8);
  ctx.lineTo(length / 2 - 16, 8);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${robot.storedPieces.length}/${intake.capacity}`, sx, sy + 5);
}

function drawHud(snapshot: SimSnapshot, events: readonly SimEvent[], width: number): void {
  const periodWindow = periodTimes(snapshot.time);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(
    snapshot.finished
      ? 'MATCH OVER'
      : `${(snapshot.period ?? '').toUpperCase()}  ${periodWindow.remaining.toFixed(1)} s`,
    24,
    96,
  );
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.fillText(`Blue ${snapshot.score.blue}`, 24, 120);
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(`Red ${snapshot.score.red}`, 110, 120);

  ctx.fillStyle = '#d1d5db';
  ctx.fillText(
    `${manual ? 'MANUAL (you)' : `SCRIPT (${controller.phase})`}${paused ? '  · PAUSED' : ''}  · ${speed}x`,
    24,
    142,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '12px ui-monospace, monospace';
  const recent = events.slice(-5);
  recent.forEach((event, i) => {
    ctx.fillText(describe(event), width - 24, 76 + i * 16);
  });
}

function periodTimes(time: number): { remaining: number } {
  let start = 0;
  for (const period of pack.match.periods) {
    const end = start + period.durationSeconds;
    if (time < end) return { remaining: end - time };
    start = end;
  }
  return { remaining: 0 };
}

function describe(event: SimEvent): string {
  const t = `${(event.tick / SIM_HZ).toFixed(1)}s`;
  switch (event.type) {
    case 'periodStarted':
      return `${t}  ${event.period} started`;
    case 'matchEnded':
      return `${t}  match ended`;
    case 'pieceAcquired':
      return `${t}  ${event.robotId} picked up ball ${event.pieceId}`;
    case 'pieceReleased':
      return `${t}  ${event.robotId} released ball ${event.pieceId}`;
    case 'pieceScored':
      return `${t}  ball ${event.pieceId} scored +${event.points} ${event.alliance}`;
  }
}

status.innerHTML =
  `Engine v${ENGINE_VERSION} · top-down debug view (3D view in Milestone 3)<br>` +
  `M manual/script · WASD drive · Q/E turn · J intake · K release · Space pause · R restart · 1/2/4 speed`;

void restart().then(() => requestAnimationFrame(frame));
