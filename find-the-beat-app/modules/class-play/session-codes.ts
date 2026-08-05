import { CLASS_PLAY_CODE_LENGTH } from "./config.ts";

const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createClassPlayJoinCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < CLASS_PLAY_CODE_LENGTH) {
    throw new Error(`At least ${CLASS_PLAY_CODE_LENGTH} random bytes are required.`);
  }
  return Array.from(
    randomBytes.slice(0, CLASS_PLAY_CODE_LENGTH),
    (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length],
  ).join("");
}

export function randomClassPlayJoinCode(): string {
  return createClassPlayJoinCode(crypto.getRandomValues(new Uint8Array(CLASS_PLAY_CODE_LENGTH)));
}
