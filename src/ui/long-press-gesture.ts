export const LONG_PRESS_HOLD_MS = 500;
export const LONG_PRESS_MAX_MOVE_PX = 12;

interface ClearableTimer {
	clear(): void;
}

interface LongPressGestureConstructorParams {
	readonly holdMs: number;
	readonly maxMovePx: number;
	onLongPress(this: void, point: LongPressPoint): void;
	schedule?(this: void, callback: () => void, delayMs: number): ClearableTimer;
}

interface LongPressPoint {
	readonly x: number;
	readonly y: number;
}

type LongPressScheduler = (callback: () => void, delayMs: number) => ClearableTimer;

interface PendingPress {
	clearTimer(): void;
	readonly origin: LongPressPoint;
}

/**
 * Pure long-press detector (no DOM). Controllers feed touch points and a clock;
 * used on mobile for image/gallery menus that become Obsidian bottom drawers.
 */
export class LongPressGesture {
	private fired = false;
	private readonly holdMs: number;
	private readonly maxMovePx: number;
	private moved = false;
	private readonly onLongPress: (point: LongPressPoint) => void;
	private pending: null | PendingPress = null;
	private readonly schedule: LongPressScheduler;

	public constructor(params: LongPressGestureConstructorParams) {
		this.holdMs = params.holdMs;
		this.maxMovePx = params.maxMovePx;
		this.onLongPress = params.onLongPress;
		this.schedule = params.schedule ?? defaultSchedule;
	}

	public cancel(): void {
		if (!this.pending) {
			return;
		}
		this.pending.clearTimer();
		this.pending = null;
	}

	/** True after a long-press until the next touchStart (swallows follow-up click/contextmenu). */
	public consumeFired(): boolean {
		return this.fired;
	}

	public touchEnd(): void {
		this.cancel();
	}

	public touchMove(point: LongPressPoint): void {
		if (!this.pending) {
			return;
		}
		const dx = point.x - this.pending.origin.x;
		const dy = point.y - this.pending.origin.y;
		if ((dx * dx) + (dy * dy) > this.maxMovePx * this.maxMovePx) {
			this.moved = true;
			this.cancel();
		}
	}

	public touchStart(point: LongPressPoint): void {
		this.cancel();
		this.fired = false;
		this.moved = false;
		const origin = point;
		const timer = this.schedule(() => {
			this.pending = null;
			this.fired = true;
			this.onLongPress(origin);
		}, this.holdMs);
		this.pending = {
			clearTimer: (): void => {
				timer.clear();
			},
			origin
		};
	}

	public wasMoved(): boolean {
		return this.moved;
	}
}

function defaultSchedule(callback: () => void, delayMs: number): ClearableTimer {
	const id = window.setTimeout(callback, delayMs);
	return {
		clear(): void {
			window.clearTimeout(id);
		}
	};
}
