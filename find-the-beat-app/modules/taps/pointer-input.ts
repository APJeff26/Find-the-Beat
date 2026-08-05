export interface RhythmPointerInput {
  isPrimary: boolean;
  pointerType: string;
  button: number;
}

/**
 * One physical contact should produce one tap. We record only the primary
 * pointer-down event and ignore secondary fingers and non-primary mouse buttons.
 * No click handler records rhythm taps, avoiding touch-generated click doubles.
 */
export function shouldRecordRhythmPointer(input: RhythmPointerInput): boolean {
  return input.isPrimary && (input.pointerType !== "mouse" || input.button === 0);
}
