import { ENGINE_VERSION, SIM_HZ } from '@frcsandbox/sim';

/**
 * Milestone 0 client entry point.
 *
 * Proves the client builds, imports the sim package across the workspace
 * boundary, and can draw to a canvas. This flat placeholder is temporary: the
 * game and bot creator are fully 3D, and the WebGL2 3D view replaces it in
 * Milestone 3.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
const status = document.querySelector<HTMLParagraphElement>('#status');

if (!canvas || !status) {
  throw new Error('Expected #viewport canvas and #status element in index.html');
}

const webgl2Available = (() => {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
})();

status.textContent = `Engine v${ENGINE_VERSION} · sim ${SIM_HZ} Hz · WebGL2 ${
  webgl2Available ? 'available' : 'unavailable'
}`;

const context = canvas.getContext('2d');

function drawPlaceholderField(): void {
  if (!canvas || !context) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  context.fillStyle = '#0f1115';
  context.fillRect(0, 0, width, height);

  // Placeholder field outline with roughly FRC proportions (about 2:1).
  const margin = 32;
  const fieldWidth = Math.min(width - margin * 2, (height - margin * 2) * 2);
  const fieldHeight = fieldWidth / 2;
  const x = (width - fieldWidth) / 2;
  const y = (height - fieldHeight) / 2;

  context.strokeStyle = '#3a4150';
  context.lineWidth = 2;
  context.strokeRect(x, y, fieldWidth, fieldHeight);

  context.fillStyle = 'rgb(59 130 246 / 0.25)';
  context.fillRect(x, y, fieldWidth * 0.08, fieldHeight);
  context.fillStyle = 'rgb(239 68 68 / 0.25)';
  context.fillRect(x + fieldWidth * 0.92, y, fieldWidth * 0.08, fieldHeight);

  context.fillStyle = '#6b7280';
  context.font = '14px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('No game pack loaded · 3D view arrives in Milestone 3', width / 2, height / 2);
}

drawPlaceholderField();
window.addEventListener('resize', drawPlaceholderField);
