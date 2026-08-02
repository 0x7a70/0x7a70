const HOBBY_ACTIVITY: Record<string, string> = {
  "amateur-archaeology": "practicing amateur archaeology",
  baking: "baking",
  birdwatching: "birdwatching",
  "building-small-machines": "building small machines",
  chess: "playing chess",
  coding: "coding",
  "collecting-strange-objects": "collecting strange objects",
  gardening: "gardening",
  journaling: "journaling",
  mapmaking: "making maps",
  meditation: "meditating",
  "metal-detecting": "metal detecting",
  "mushroom-hunting": "hunting mushrooms",
  painting: "painting",
  photography: "taking photographs",
  "puzzle-solving": "solving puzzles",
  "radio-listening": "listening to the radio",
  stargazing: "stargazing",
  storytelling: "telling stories",
  woodworking: "woodworking",
  despair: "in despair",
};

export function hobbyActivity(slug: string) {
  return HOBBY_ACTIVITY[slug] || `practicing ${slug.replaceAll("-", " ")}`;
}
