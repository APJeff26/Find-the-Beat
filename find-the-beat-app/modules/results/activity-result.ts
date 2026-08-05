import type { TapEvaluation } from "../evaluation/tap-evaluation";

export interface ActivityResult {
  accuracyScore: number;
  consistencyScore: number;
  accuracyLabel: string;
  consistencyLabel: string;
  headline: string;
  message: string;
  matchedBeats: number;
  expectedBeats: number;
  tapCount: number;
}

const labelFor = (score: number) => {
  if (score >= 85) return "Strong match";
  if (score >= 65) return "Growing strong";
  if (score >= 40) return "Good start";
  return "Keep exploring";
};

export function createActivityResult(
  evaluation: TapEvaluation,
  tapCount: number,
): ActivityResult {
  const overall = (evaluation.accuracyScore + evaluation.consistencyScore) / 2;
  const [headline, message] = overall >= 80
    ? ["You found the groove!", "Your ears and taps worked together beautifully."]
    : overall >= 55
      ? ["Your beat is growing!", "You caught lots of the beat. Every try makes it steadier."]
      : ["Great musical exploring!", "You listened and gave it a try. Let’s hear the groove once more."];

  return {
    accuracyScore: evaluation.accuracyScore,
    consistencyScore: evaluation.consistencyScore,
    accuracyLabel: labelFor(evaluation.accuracyScore),
    consistencyLabel: labelFor(evaluation.consistencyScore),
    headline,
    message,
    matchedBeats: evaluation.matchedBeats,
    expectedBeats: evaluation.expectedBeats,
    tapCount,
  };
}
