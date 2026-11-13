import type { GamePack, SimEvent, SimSnapshot } from '@frcsandbox/sim';
import { SIM_HZ } from '@frcsandbox/sim';

/**
 * Draws the heads-up display (score, clock, hub status, event log, controls)
 * onto a 2D canvas layered over the 3D view.
 */
export class Hud {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pack: GamePack,
    private readonly controlsHint: string,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('HUD canvas 2D is not available');
    this.ctx = ctx;
  }

  draw(snapshot: SimSnapshot, events: readonly SimEvent[], cameraLabel: string): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Score and clock, centered at the top.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${snapshot.score.red}`, w / 2 - 90, 34);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`${snapshot.score.blue}`, w / 2 + 90, 34);

    ctx.fillStyle = '#f9fafb';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(
      snapshot.finished
        ? 'MATCH OVER'
        : `${(snapshot.period ?? '').toUpperCase()}  ${this.remaining(snapshot.time).toFixed(1)}`,
      w / 2,
      30,
    );

    // Hub status.
    // Only for packs with a few goals that switch on and off (REBUILT hubs).
    if (snapshot.goals.length > 0 && snapshot.goals.length <= 4) {
      ctx.font = '13px system-ui, sans-serif';
      const text = snapshot.finished
        ? 'match over'
        : snapshot.goals
            .map((g) => `${g.alliance} ${g.active ? 'ACTIVE' : 'inactive'}`)
            .join('   ');
      ctx.fillStyle = '#d1d5db';
      ctx.fillText(text, w / 2, 54);
    }

    // Event log, bottom-left.
    ctx.textAlign = 'left';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#9ca3af';
    events.slice(-5).forEach((event, i) => {
      ctx.fillText(this.describe(event), 16, h - 92 + i * 16);
    });

    // Camera and controls, bottom.
    ctx.fillStyle = '#d1d5db';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Camera: ${cameraLabel}  (Tab to change)`, 16, h - 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(this.controlsHint, w - 16, h - 16);
  }

  private remaining(time: number): number {
    let start = 0;
    for (const period of this.pack.match.periods) {
      const end = start + period.durationSeconds;
      if (time < end) return end - time;
      start = end;
    }
    return 0;
  }

  private describe(event: SimEvent): string {
    const t = `${(event.tick / SIM_HZ).toFixed(1)}s`;
    switch (event.type) {
      case 'periodStarted':
        return `${t}  ${event.period} started`;
      case 'matchEnded':
        return `${t}  match ended`;
      case 'pieceAcquired':
        return `${t}  ${event.robotId} picked up piece ${event.pieceId}`;
      case 'pieceReleased':
        return `${t}  ${event.robotId} released piece ${event.pieceId}`;
      case 'pieceFed':
        return `${t}  ${event.station} fed piece ${event.pieceId}`;
      case 'pieceLeftField':
        return `${t}  piece ${event.pieceId} left the field`;
      case 'pieceReturned':
        return `${t}  piece ${event.pieceId} put back by a referee`;
      case 'pieceScored':
        return `${t}  piece ${event.pieceId} ${event.active ? `+${event.points} ${event.alliance}` : 'inactive hub'}`;
    }
  }
}
