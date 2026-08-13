import {
	describe,
	expect,
	it
} from 'vitest';

import { LongPressGesture } from '../long-press-gesture.ts';

interface ClearableTimer {
	clear(): void;
}

interface LongPressPoint {
	readonly x: number;
	readonly y: number;
}

interface TestClock {
	advance(ms: number): void;
	now(): number;
	schedule(callback: () => void, delayMs: number): ClearableTimer;
}

interface TestTimer {
	at: number;
	callback(): void;
	cleared: boolean;
}

describe('LongPressGesture', () => {
	it('fires after the hold duration without movement', () => {
		const fired: LongPressPoint[] = [];
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (point: LongPressPoint): void => {
				fired.push(point);
			},
			schedule: clock.schedule
		});

		gesture.touchStart({ x: 10, y: 20 });
		clock.advance(500);

		expect(fired).toEqual([{ x: 10, y: 20 }]);
	});

	it('cancels when the finger moves beyond the threshold', () => {
		const fired: LongPressPoint[] = [];
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (point: LongPressPoint): void => {
				fired.push(point);
			},
			schedule: clock.schedule
		});

		gesture.touchStart({ x: 10, y: 20 });
		gesture.touchMove({ x: 30, y: 20 });
		clock.advance(600);

		expect(fired).toEqual([]);
	});

	it('cancels on touch end before the hold duration', () => {
		const fired: LongPressPoint[] = [];
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (point: LongPressPoint): void => {
				fired.push(point);
			},
			schedule: clock.schedule
		});

		gesture.touchStart({ x: 10, y: 20 });
		gesture.touchEnd();
		clock.advance(600);

		expect(fired).toEqual([]);
	});

	it('consumeFired stays true until the next touchStart', () => {
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (): void => undefined,
			schedule: clock.schedule
		});

		expect(gesture.consumeFired()).toBe(false);
		gesture.touchStart({ x: 10, y: 20 });
		clock.advance(500);
		expect(gesture.consumeFired()).toBe(true);
		expect(gesture.consumeFired()).toBe(true);
		gesture.touchStart({ x: 1, y: 1 });
		expect(gesture.consumeFired()).toBe(false);
	});

	it('treats an early touchEnd without movement as a short press', () => {
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (): void => undefined,
			schedule: clock.schedule
		});

		gesture.touchStart({ x: 10, y: 20 });
		expect(gesture.wasMoved()).toBe(false);
		gesture.touchEnd();
		expect(gesture.consumeFired()).toBe(false);
		expect(gesture.wasMoved()).toBe(false);
	});

	it('marks wasMoved when the finger exceeds the threshold', () => {
		const clock = createTestClock();
		const gesture = new LongPressGesture({
			holdMs: 500,
			maxMovePx: 10,
			onLongPress: (): void => undefined,
			schedule: clock.schedule
		});

		gesture.touchStart({ x: 10, y: 20 });
		gesture.touchMove({ x: 30, y: 20 });
		expect(gesture.wasMoved()).toBe(true);
		expect(gesture.consumeFired()).toBe(false);
	});
});

function createTestClock(): TestClock {
	let nowMs = 0;
	const timers: TestTimer[] = [];
	return {
		advance(ms: number): void {
			nowMs += ms;
			for (const timer of timers) {
				if (!timer.cleared && timer.at <= nowMs) {
					timer.cleared = true;
					timer.callback();
				}
			}
		},
		now: (): number => nowMs,
		schedule(callback: () => void, delayMs: number): ClearableTimer {
			const timer: TestTimer = { at: nowMs + delayMs, callback, cleared: false };
			timers.push(timer);
			return {
				clear(): void {
					timer.cleared = true;
				}
			};
		}
	};
}
