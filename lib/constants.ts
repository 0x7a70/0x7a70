export const POTATO_NAMES = [
  "0x7a70", "Arthur", "Bernard", "Clara", "Dennis", "Eleanor", "Frank",
  "Gloria", "Harold", "Irene", "Jasper", "Kevin", "Linda", "Martin",
  "Nora", "Oscar", "Patricia", "Raymond", "Sylvia", "Walter",
] as const;

export const HOBBY_NAMES = [
  "Amateur Archaeology", "Baking", "Birdwatching", "Building Small Machines",
  "Chess", "Coding", "Collecting Strange Objects", "Gardening", "Journaling",
  "Mapmaking", "Meditation", "Metal Detecting", "Mushroom Hunting", "Painting",
  "Photography", "Puzzle Solving", "Radio Listening", "Stargazing",
  "Storytelling", "Woodworking",
] as const;

export const LOOP_WORDS = [
  "the", "beginning", "is", "also", "the", "end", "crop", "rotation",
  "makes", "neat", "circles", "and", "the", "seedlings", "spiral", "inward",
  "but", "never", "know", "that",
] as const;

export const CONTRACT = "0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f";
export const TOKEN_URL = `https://potato.fm/token/${CONTRACT}`;
export const X_URL = "https://x.com/0x7a70";
export const TELEGRAM_GROUP_URL = "https://t.me/tg0x7a70";
export const TELEGRAM_BOT_URL = "https://t.me/the0x7a70bot";
export const CONVEX_URL = "https://insightful-chihuahua-895.convex.cloud";

export function slugify(value: string) {
  return value.toLowerCase().replace(/^0x/, "0x").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function corruptionStage(value: number) {
  return Math.min(4, Math.floor(Math.max(0, Math.min(100, value)) / 20));
}

export function potatoImage(value: number) {
  if (value < 25) return "/potato1.png?v=20260730c";
  if (value < 50) return "/potato2.png?v=20260730c";
  if (value < 75) return "/potato3.png?v=20260730c";
  return "/potato4.png?v=20260730c";
}

export function removalProbability(corruption: number) {
  return 0.25 + 0.5 * (Math.max(0, Math.min(100, corruption)) / 100);
}

export function corruptionModifier(value: number) {
  if (value < 20) return "Coherent, grounded, curious, and only faintly aware of static.";
  if (value < 40) return "Mostly coherent; unusual associations and mild signal interference are emerging.";
  if (value < 60) return "Suspicious patterns, repetition, and distorted metaphors are becoming difficult to ignore.";
  if (value < 80) return "Fragmented logic and obsessive ideas interrupt otherwise readable thought.";
  return "Severely corrupted: unsettling, compulsive, and unstable, but still recognizably itself and understandable.";
}
