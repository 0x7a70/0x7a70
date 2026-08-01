/**
 * Patch-page hobby icon manifest.
 *
 * Add supplied icon files beneath public/hobby-icons and map their hobby slug
 * here. Unmapped hobbies render no placeholder and make no network request.
 */
export const HOBBY_ICON_PATHS: Partial<Record<string, string>> = {
  "amateur-archaeology": "/hobby-icons/amateur-archaeology.png",
  baking: "/hobby-icons/baking.png",
  birdwatching: "/hobby-icons/birdwatching.png",
  "building-small-machines": "/hobby-icons/building-small-machines.png",
  chess: "/hobby-icons/chess.png",
  coding: "/hobby-icons/coding.png",
  "collecting-strange-objects": "/hobby-icons/collecting-strange-objects.png",
  gardening: "/hobby-icons/gardening.png",
  journaling: "/hobby-icons/journaling.png",
  mapmaking: "/hobby-icons/mapmaking.png",
  meditation: "/hobby-icons/meditation.png",
  "metal-detecting": "/hobby-icons/metal-detecting.png",
  "mushroom-hunting": "/hobby-icons/mushroom-hunting.png",
  painting: "/hobby-icons/painting.png",
  photography: "/hobby-icons/photography.png",
  "puzzle-solving": "/hobby-icons/puzzle-solving.png",
  "radio-listening": "/hobby-icons/radio-listening.png",
  stargazing: "/hobby-icons/stargazing.png",
  storytelling: "/hobby-icons/storytelling.png",
  woodworking: "/hobby-icons/woodworking.png",
};

export function hobbyIconPath(hobbySlug: string) {
  return HOBBY_ICON_PATHS[hobbySlug];
}

export function longestHeldHobby(hobbySlugs: string[]) {
  // Initial hobbies share the same start time. Subsequent hobbies are appended,
  // while abandoned hobbies are removed, so the first current entry is oldest.
  return hobbySlugs[0];
}
