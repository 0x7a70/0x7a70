import { describe, expect, it } from "vitest";
import {
  LOOP_WORDS,
  POTATO_NAMES,
  corruptionStage,
  potatoImage,
  removalProbability,
  slugify,
} from "../lib/constants";

describe("corruption presentation", () => {
  it("selects all four potato images at exact boundaries", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(potatoImage)).toEqual([
      "/potato1.png?v=20260730c", "/potato1.png?v=20260730c", "/potato2.png?v=20260730c", "/potato2.png?v=20260730c",
      "/potato3.png?v=20260730c", "/potato3.png?v=20260730c", "/potato4.png?v=20260730c", "/potato4.png?v=20260730c",
    ]);
  });

  it("selects five stages and clamps invalid values", () => {
    expect([-1, 0, 19, 20, 39, 40, 59, 60, 79, 80, 100, 101].map(corruptionStage))
      .toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  });

  it("increases hobby-removal probability with corruption", () => {
    expect(removalProbability(0)).toBe(0.25);
    expect(removalProbability(50)).toBe(0.5);
    expect(removalProbability(100)).toBe(0.75);
  });
});

describe("hidden navigation loop", () => {
  it("has exactly one word for each potato", () => {
    expect(LOOP_WORDS).toHaveLength(20);
    expect(POTATO_NAMES).toHaveLength(20);
    expect(LOOP_WORDS.join(" ")).toBe(
      "the beginning is also the end crop rotation makes neat circles and the seedlings spiral inward but never know that",
    );
  });

  it("gives every potato a distinct route", () => {
    expect(new Set(POTATO_NAMES.map(slugify)).size).toBe(20);
    expect(slugify("0x7a70")).toBe("0x7a70");
  });
});
