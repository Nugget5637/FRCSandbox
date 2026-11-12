import type { InputManager } from './input';

/**
 * On-screen controls for phones and tablets: a left thumbstick for driving, a
 * right thumbstick for turning, and intake/shoot buttons. Only shown when a
 * touch is detected, so it stays out of the way on desktop.
 */
export function setupTouchControls(root: HTMLElement, input: InputManager): void {
  if (!matchMedia('(pointer: coarse)').matches) return;

  const layer = document.createElement('div');
  layer.className = 'touch-layer';
  layer.innerHTML = `
    <div class="stick" id="drive-stick"><div class="knob"></div></div>
    <div class="stick" id="turn-stick"><div class="knob"></div></div>
    <button class="touch-btn" id="intake-btn">INTAKE</button>
    <button class="touch-btn" id="shoot-btn">SHOOT</button>
  `;
  root.appendChild(layer);

  bindStick(layer.querySelector('#drive-stick')!, (x, y) => input.setTouch({ x: -y, y: -x }));
  bindStick(layer.querySelector('#turn-stick')!, (x) => input.setTouch({ rotate: -x }));
  bindButton(layer.querySelector('#intake-btn')!, (down) => input.setTouch({ intake: down }));
  bindButton(layer.querySelector('#shoot-btn')!, (down) => input.setTouch({ release: down }));
}

function bindStick(el: HTMLElement, onMove: (x: number, y: number) => void): void {
  const knob = el.querySelector<HTMLElement>('.knob')!;
  let id: number | null = null;
  const radius = 50;

  const move = (e: PointerEvent) => {
    if (id !== e.pointerId) return;
    const rect = el.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / radius, dy / radius);
  };
  const end = (e: PointerEvent) => {
    if (id !== e.pointerId) return;
    id = null;
    knob.style.transform = 'translate(0, 0)';
    onMove(0, 0);
  };

  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    el.setPointerCapture(e.pointerId);
    move(e);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function bindButton(el: HTMLElement, onChange: (down: boolean) => void): void {
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    onChange(true);
  });
  el.addEventListener('pointerup', () => onChange(false));
  el.addEventListener('pointercancel', () => onChange(false));
}
