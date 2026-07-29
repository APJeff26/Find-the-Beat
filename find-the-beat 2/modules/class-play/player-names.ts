import { CLASS_PLAY_NAME_MAX_LENGTH } from "./config.ts";

const DISALLOWED_NAME_WORDS = ["fuck", "shit", "bitch", "nigger", "cunt"];

export function cleanClassPlayName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CLASS_PLAY_NAME_MAX_LENGTH);
}

export function isAppropriateClassPlayName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
  return !DISALLOWED_NAME_WORDS.some((word) => normalized.includes(word));
}

export function makeUniqueClassPlayName(requestedName: string, existingNames: readonly string[]): string {
  const normalizedExisting = new Set(existingNames.map((name) => name.toLowerCase()));
  let displayName = requestedName;
  let suffix = 2;
  while (normalizedExisting.has(displayName.toLowerCase())) {
    const suffixText = ` ${suffix}`;
    displayName = `${requestedName.slice(0, CLASS_PLAY_NAME_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return displayName;
}
