import type { RecordedTap } from "../taps/tap-recorder";

export const MATCH_WINDOW_MS = 300;

export interface TapMatch {
  beatIndex: number;
  expectedTimeMs: number;
  tapTimeMs: number;
  errorMs: number;
}

export interface TapEvaluation {
  accuracyScore: number;
  consistencyScore: number;
  matchedBeats: number;
  missedBeats: number;
  extraTaps: number;
  expectedBeats: number;
  meanAbsoluteErrorMs: number | null;
  errorDeviationMs: number | null;
  matches: readonly TapMatch[];
}

const clampScore = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

/**
 * Pairs each expected beat with the closest unused tap inside ±300ms.
 *
 * Accuracy combines coverage and closeness. A missed beat contributes zero;
 * a matched tap falls linearly from full credit at 0ms to zero at 300ms.
 *
 * Consistency measures how similarly early or late matched taps are. Signed
 * error deviation maps from 100 at 0ms to 0 at 180ms, then beat coverage is
 * applied. These are preliminary learning metrics, not standardized measures.
 */
export function evaluateTaps(
  expectedBeatsMs: readonly number[],
  taps: readonly RecordedTap[],
): TapEvaluation {
  const unusedTaps = new Set(taps.map((_, index) => index));
  const matches: TapMatch[] = [];

  expectedBeatsMs.forEach((expectedTimeMs, beatIndex) => {
    let bestTapIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tapIndex of unusedTaps) {
      const distance = Math.abs(taps[tapIndex].audioTimeMs - expectedTimeMs);
      if (distance <= MATCH_WINDOW_MS && distance < bestDistance) {
        bestDistance = distance;
        bestTapIndex = tapIndex;
      }
    }
    if (bestTapIndex !== null) {
      const tapTimeMs = taps[bestTapIndex].audioTimeMs;
      matches.push({ beatIndex, expectedTimeMs, tapTimeMs, errorMs: tapTimeMs - expectedTimeMs });
      unusedTaps.delete(bestTapIndex);
    }
  });

  const expectedCount = expectedBeatsMs.length;
  const absoluteErrors = matches.map((match) => Math.abs(match.errorMs));
  const accuracyCredit = absoluteErrors.reduce(
    (sum, error) => sum + Math.max(0, 1 - error / MATCH_WINDOW_MS),
    0,
  );
  const accuracyScore = expectedCount === 0
    ? 0
    : clampScore((accuracyCredit / expectedCount) * 100);

  const signedErrors = matches.map((match) => match.errorMs);
  const meanError = signedErrors.length
    ? signedErrors.reduce((sum, error) => sum + error, 0) / signedErrors.length
    : 0;
  const deviation = signedErrors.length >= 2
    ? Math.sqrt(
      signedErrors.reduce((sum, error) => sum + (error - meanError) ** 2, 0)
      / signedErrors.length,
    )
    : null;
  const coverage = expectedCount === 0 ? 0 : matches.length / expectedCount;
  const steadiness = deviation === null ? 0 : Math.max(0, 1 - deviation / 180);

  return {
    accuracyScore,
    consistencyScore: clampScore(steadiness * coverage * 100),
    matchedBeats: matches.length,
    missedBeats: expectedCount - matches.length,
    extraTaps: unusedTaps.size,
    expectedBeats: expectedCount,
    meanAbsoluteErrorMs: absoluteErrors.length
      ? absoluteErrors.reduce((sum, error) => sum + error, 0) / absoluteErrors.length
      : null,
    errorDeviationMs: deviation,
    matches,
  };
}
