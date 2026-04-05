import { describe, expect, it } from "vitest";
import {
	computeEffectiveDuration,
	computeSegmentFrameCounts,
	computeTrimSegments,
	shouldFailDecodeEndedEarly,
	splitSegmentsBySpeed,
} from "./streamingDecoder";

describe("shouldFailDecodeEndedEarly", () => {
	it("does not fail once every segment has been satisfied", () => {
		expect(
			shouldFailDecodeEndedEarly({
				cancelled: false,
				lastDecodedFrameSec: 5.33,
				requiredEndSec: 6.498,
				streamDurationSec: 5.33,
			}),
		).toBe(false);
	});

	it("fails when decode stops far before the required end", () => {
		expect(
			shouldFailDecodeEndedEarly({
				cancelled: false,
				lastDecodedFrameSec: 5.33,
				requiredEndSec: 10,
				streamDurationSec: 5.33,
			}),
		).toBe(true);
	});

	it("fails when no frame could be decoded for a non-empty timeline", () => {
		expect(
			shouldFailDecodeEndedEarly({
				cancelled: false,
				lastDecodedFrameSec: null,
				requiredEndSec: 1,
			}),
		).toBe(true);
	});

	it("fails when the decoder has not reached the reported stream end", () => {
		expect(
			shouldFailDecodeEndedEarly({
				cancelled: false,
				lastDecodedFrameSec: 4.9,
				requiredEndSec: 6.498,
				streamDurationSec: 5.33,
			}),
		).toBe(true);
	});
});

describe("computeTrimSegments", () => {
	it("returns full duration when no trim regions", () => {
		expect(computeTrimSegments(60)).toEqual([{ startSec: 0, endSec: 60 }]);
	});

	it("returns full duration for empty trim array", () => {
		expect(computeTrimSegments(60, [])).toEqual([{ startSec: 0, endSec: 60 }]);
	});

	it("trims from the start", () => {
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		expect(computeTrimSegments(60, trims)).toEqual([{ startSec: 10, endSec: 60 }]);
	});

	it("trims from the end", () => {
		const trims = [{ id: "t1", startMs: 50000, endMs: 60000 }];
		expect(computeTrimSegments(60, trims)).toEqual([{ startSec: 0, endSec: 50 }]);
	});

	it("trims from the middle", () => {
		const trims = [{ id: "t1", startMs: 20000, endMs: 30000 }];
		expect(computeTrimSegments(60, trims)).toEqual([
			{ startSec: 0, endSec: 20 },
			{ startSec: 30, endSec: 60 },
		]);
	});

	it("handles multiple non-overlapping trims", () => {
		const trims = [
			{ id: "t1", startMs: 10000, endMs: 20000 },
			{ id: "t2", startMs: 40000, endMs: 50000 },
		];
		expect(computeTrimSegments(60, trims)).toEqual([
			{ startSec: 0, endSec: 10 },
			{ startSec: 20, endSec: 40 },
			{ startSec: 50, endSec: 60 },
		]);
	});

	it("handles overlapping trims by merging", () => {
		const trims = [
			{ id: "t1", startMs: 5000, endMs: 15000 },
			{ id: "t2", startMs: 10000, endMs: 20000 },
		];
		expect(computeTrimSegments(60, trims)).toEqual([
			{ startSec: 0, endSec: 5 },
			{ startSec: 20, endSec: 60 },
		]);
	});
});

describe("splitSegmentsBySpeed", () => {
	it("assigns speed 1 when no speed regions", () => {
		const segments = [{ startSec: 0, endSec: 60 }];
		expect(splitSegmentsBySpeed(segments)).toEqual([{ startSec: 0, endSec: 60, speed: 1 }]);
	});

	it("assigns speed 1 for empty speed array", () => {
		const segments = [{ startSec: 0, endSec: 60 }];
		expect(splitSegmentsBySpeed(segments, [])).toEqual([
			{ startSec: 0, endSec: 60, speed: 1 },
		]);
	});

	it("applies speed to full segment", () => {
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 10000, endMs: 60000, speed: 2 as const }];
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 10, endSec: 60, speed: 2 },
		]);
	});

	it("applies speed to partial segment leaving tail at 1x", () => {
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 50000, speed: 2 as const }];
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 10, endSec: 50, speed: 2 },
			{ startSec: 50, endSec: 60, speed: 1 },
		]);
	});

	it("applies speed to partial segment leaving head at 1x", () => {
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 20000, endMs: 60000, speed: 2 as const }];
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 10, endSec: 20, speed: 1 },
			{ startSec: 20, endSec: 60, speed: 2 },
		]);
	});

	it("speed region wider than segment clips to segment bounds", () => {
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 70000, speed: 2 as const }];
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 10, endSec: 60, speed: 2 },
		]);
	});

	it("handles multiple segments with one speed region across both", () => {
		const segments = [
			{ startSec: 0, endSec: 20 },
			{ startSec: 30, endSec: 60 },
		];
		const speeds = [{ id: "s1", startMs: 0, endMs: 60000, speed: 2 as const }];
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 0, endSec: 20, speed: 2 },
			{ startSec: 30, endSec: 60, speed: 2 },
		]);
	});

	it("expands speed region end to bridge a trim gap when trimRegions provided", () => {
		// Trim [0,10], speed [0,50] at 2x — user intended to cover all 50s of
		// remaining content but speed endMs (50000) falls short of the source-time
		// end (60s).  With trim expansion the effective speed range becomes [0,60].
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 50000, speed: 2 as const }];
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		expect(splitSegmentsBySpeed(segments, speeds, trims)).toEqual([
			{ startSec: 10, endSec: 60, speed: 2 },
		]);
	});

	it("expands speed region end to bridge a middle trim gap", () => {
		// Trim [20,30], speed [0,50] at 2x — speed should bridge the gap and
		// reach source 60s (50 + 10 = 60).
		const segments = [
			{ startSec: 0, endSec: 20 },
			{ startSec: 30, endSec: 60 },
		];
		const speeds = [{ id: "s1", startMs: 0, endMs: 50000, speed: 2 as const }];
		const trims = [{ id: "t1", startMs: 20000, endMs: 30000 }];
		expect(splitSegmentsBySpeed(segments, speeds, trims)).toEqual([
			{ startSec: 0, endSec: 20, speed: 2 },
			{ startSec: 30, endSec: 60, speed: 2 },
		]);
	});

	it("does not expand when trim gap is outside speed region", () => {
		// Trim [50,60], speed [0,40] at 2x — trim is outside the speed range
		const segments = [{ startSec: 0, endSec: 50 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 40000, speed: 2 as const }];
		const trims = [{ id: "t1", startMs: 50000, endMs: 60000 }];
		expect(splitSegmentsBySpeed(segments, speeds, trims)).toEqual([
			{ startSec: 0, endSec: 40, speed: 2 },
			{ startSec: 40, endSec: 50, speed: 1 },
		]);
	});

	it("works without trimRegions (backwards compatible)", () => {
		const segments = [{ startSec: 10, endSec: 60 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 50000, speed: 2 as const }];
		// No trimRegions passed — speed covers [10,50], tail at 1x
		expect(splitSegmentsBySpeed(segments, speeds)).toEqual([
			{ startSec: 10, endSec: 50, speed: 2 },
			{ startSec: 50, endSec: 60, speed: 1 },
		]);
	});
});

describe("computeEffectiveDuration", () => {
	it("returns full duration with no trim or speed", () => {
		expect(computeEffectiveDuration(60)).toBe(60);
	});

	it("trims only", () => {
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		expect(computeEffectiveDuration(60, trims)).toBe(50);
	});

	it("speed only", () => {
		const speeds = [{ id: "s1", startMs: 0, endMs: 60000, speed: 2 as const }];
		expect(computeEffectiveDuration(60, undefined, speeds)).toBe(30);
	});

	it("trim + speed covering entire remaining section = 25s (the reported bug scenario)", () => {
		// 60s video, trim first 10s, 2x speed on [10,60]
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		const speeds = [{ id: "s1", startMs: 10000, endMs: 60000, speed: 2 as const }];
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(25);
	});

	it("trim + speed covering full video = 25s", () => {
		// 60s video, trim first 10s, 2x speed on entire [0,60]
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 60000, speed: 2 as const }];
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(25);
	});

	it("FIX: speed region bridging trim gap now covers full remaining content", () => {
		// Previously this returned 30s because the speed region [0,50000] didn't
		// reach source-time 60s.  With trim-expansion the speed region extends to
		// [0,60000] (50000 + 10000 trim gap), so all 50s of kept content are at 2x.
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 50000, speed: 2 as const }];
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(25);
	});

	it("middle trim + 2x speed on whole video", () => {
		const trims = [{ id: "t1", startMs: 20000, endMs: 30000 }];
		const speeds = [{ id: "s1", startMs: 0, endMs: 60000, speed: 2 as const }];
		// Segments: [0,20] + [30,60] = 50s kept, all at 2x = 25s
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(25);
	});

	it("multiple trims + 2x speed on whole video", () => {
		const trims = [
			{ id: "t1", startMs: 10000, endMs: 15000 },
			{ id: "t2", startMs: 40000, endMs: 50000 },
		];
		const speeds = [{ id: "s1", startMs: 0, endMs: 60000, speed: 2 as const }];
		// Segments: [0,10] + [15,40] + [50,60] = 10+25+10 = 45s at 2x = 22.5s
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(22.5);
	});

	it("trim + partial speed region (different speeds)", () => {
		const trims = [{ id: "t1", startMs: 0, endMs: 10000 }];
		const speeds = [
			{ id: "s1", startMs: 10000, endMs: 30000, speed: 2 as const },
			{ id: "s2", startMs: 30000, endMs: 60000, speed: 0.5 as const },
		];
		// Segment [10,60]: split into [10,30] at 2x and [30,60] at 0.5x
		// = 20/2 + 30/0.5 = 10 + 60 = 70s
		expect(computeEffectiveDuration(60, trims, speeds)).toBe(70);
	});
});

describe("computeSegmentFrameCounts", () => {
	it("single segment matches ceil(duration * fps)", () => {
		const segments = [{ startSec: 10, endSec: 60, speed: 2 }];
		const counts = computeSegmentFrameCounts(segments, 60);
		// 50/2 = 25s, 25 * 60 = 1500 frames
		expect(counts).toEqual([1500]);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(1500);
	});

	it("total frames matches ceil(effectiveDuration * fps) for multiple segments", () => {
		const segments = [
			{ startSec: 0, endSec: 0.5, speed: 2 },
			{ startSec: 0.5, endSec: 1.0, speed: 2 },
		];
		// effectiveDuration = 0.25 + 0.25 = 0.5s, totalFrames = ceil(15) = 15
		const counts = computeSegmentFrameCounts(segments, 30);
		const total = counts.reduce((a, b) => a + b, 0);
		expect(total).toBe(15);
	});

	it("per-segment ceil would overshoot but budget approach does not", () => {
		// With per-segment ceil: ceil(7.5) + ceil(7.5) = 8 + 8 = 16
		// With budget approach: total = ceil(15) = 15, distributed as 8 + 7 (or 7 + 8)
		const segments = [
			{ startSec: 0, endSec: 0.5, speed: 2 },
			{ startSec: 0.5, endSec: 1.0, speed: 2 },
		];
		const counts = computeSegmentFrameCounts(segments, 30);
		const total = counts.reduce((a, b) => a + b, 0);
		// Old approach: 8 + 8 = 16; New approach: exactly 15
		expect(total).toBe(15);
	});

	it("many segments with fractional frame counts sum to correct total", () => {
		const segments = [
			{ startSec: 0, endSec: 3.33, speed: 1.5 },
			{ startSec: 5, endSec: 8.33, speed: 2 },
			{ startSec: 10, endSec: 12.5, speed: 0.75 },
		];
		const fps = 30;
		const effectiveDuration = segments.reduce(
			(s, seg) => s + (seg.endSec - seg.startSec) / seg.speed,
			0,
		);
		const expectedTotal = Math.ceil(effectiveDuration * fps);
		const counts = computeSegmentFrameCounts(segments, fps);
		const total = counts.reduce((a, b) => a + b, 0);
		expect(total).toBe(expectedTotal);
	});

	it("each segment gets at least 1 frame when it has non-zero duration", () => {
		const segments = [
			{ startSec: 0, endSec: 0.001, speed: 2 },
			{ startSec: 5, endSec: 5.001, speed: 2 },
			{ startSec: 10, endSec: 60, speed: 2 },
		];
		const counts = computeSegmentFrameCounts(segments, 60);
		// Every segment with positive duration should have at least 1 frame
		for (let i = 0; i < segments.length; i++) {
			expect(counts[i]).toBeGreaterThanOrEqual(1);
		}
	});
});
