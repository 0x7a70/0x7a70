export const POTATOES = [
  "0x7a70", "Arthur", "Bernard", "Clara", "Dennis", "Eleanor", "Frank",
  "Gloria", "Harold", "Irene", "Jasper", "Kevin", "Linda", "Martin",
  "Nora", "Oscar", "Patricia", "Raymond", "Sylvia", "Walter",
] as const;

export const HOBBIES = [
  "Amateur Archaeology", "Baking", "Birdwatching", "Building Small Machines",
  "Chess", "Coding", "Collecting Strange Objects", "Gardening", "Journaling",
  "Mapmaking", "Meditation", "Metal Detecting", "Mushroom Hunting", "Painting",
  "Photography", "Puzzle Solving", "Radio Listening", "Stargazing",
  "Storytelling", "Woodworking",
] as const;

export const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const randomDelay = (minMinutes: number, maxMinutes: number) =>
  randomInt(minMinutes * 60_000, maxMinutes * 60_000);

export const randomDelayAtFrequency = (
  minMinutes: number,
  maxMinutes: number,
  frequencyMultiplier: number,
) => Math.round(randomDelay(minMinutes, maxMinutes) / frequencyMultiplier);

export const randomThoughtDelay = () => randomDelay(4, 8);

export function randomCorruptionChange(current: number) {
  // Most changes are plainly visible, with occasional larger shocks.
  const magnitude = Math.min(
    35,
    randomInt(4, 24) + (Math.random() < 0.18 ? randomInt(8, 18) : 0),
  );

  // A mild outward bias keeps individual potatoes from clustering around the
  // midpoint while preserving plenty of reversals and movement in both directions.
  const awayFromMiddle = Math.random() < 0.62;
  const outwardDirection = current === 50
    ? (Math.random() < 0.5 ? -1 : 1)
    : (current < 50 ? -1 : 1);
  let direction = awayFromMiddle ? outwardDirection : -outwardDirection;

  if ((current <= 0 && direction < 0) || (current >= 100 && direction > 0)) {
    direction *= -1;
  }

  return direction * magnitude;
}

export const FALLBACK_LINES = [
  "The root line is occupied. Your message remains warm in the soil.",
  "Static crossed the furrow before the answer arrived. Try the signal again.",
  "The patch heard you, but the underground relay closed one eye.",
  "No clean reply surfaced. Something below is still considering your words.",
] as const;

export function corruptionModifier(value: number) {
  if (value < 20) return "Coherent, grounded, curious, with only faint static.";
  if (value < 40) return "Mostly coherent, with unusual associations and mild signal interference.";
  if (value < 60) return "Suspicious patterns, repetition, and distorted metaphors are becoming difficult to ignore.";
  if (value < 80) return "Fragmented logic and obsessive ideas interrupt otherwise readable thought.";
  return "Severely corrupted, compulsive and unstable, but still recognizably itself and understandable.";
}
