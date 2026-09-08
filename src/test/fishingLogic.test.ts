import { describe, expect, it, vi } from "vitest";
import { getFishForLocation, LOCATIONS } from "@/game/data";
import { RARITY_CONFIG } from "@/game/types";
import { getNormalizedRarityWeights, getWaitTime, rollFish, rollWeight } from "@/game/fishingLogic";

describe("fishing rules", () => {
  it("selects only fish available in the selected location", () => {
    const location = LOCATIONS.find((item) => item.id === "amazon");
    expect(location).toBeDefined();

    const poolIds = getFishForLocation(location!).map((fish) => fish.id);
    for (let i = 0; i < 100; i += 1) {
      expect(poolIds).toContain(rollFish(location!, 1).id);
    }
  });

  it("normalizes rarity weights to the available pool", () => {
    const location = LOCATIONS.find((item) => item.id === "amazon");
    expect(location).toBeDefined();

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const fish = rollFish(location!, 1);
    const configuredRarities = Object.keys(RARITY_CONFIG);
    expect(configuredRarities).toContain(fish.rarity);
    vi.restoreAllMocks();
  });

  it("keeps normalized rarity probabilities bounded and summing to one", () => {
    const location = LOCATIONS.find((item) => item.id === "amazon");
    const pool = getFishForLocation(location!);
    const weights = getNormalizedRarityWeights(pool, 30);

    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every(item => item.weight > 0 && item.weight <= 1)).toBe(true);
    expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
  });

  it("keeps generated weights within the fish range", () => {
    const location = LOCATIONS.find((item) => item.id === "amazon");
    const fish = rollFish(location!, 1);
    const weight = rollWeight(fish);

    expect(weight).toBeGreaterThanOrEqual(fish.minWeight);
    expect(weight).toBeLessThanOrEqual(fish.maxWeight);
  });

  it("rollWeight is deterministic with an injected random and stays within bounds", () => {
    const fish = getFishForLocation(LOCATIONS.find(l => l.id === "amazon")!)[0];
    expect(rollWeight(fish, () => 0)).toBe(fish.minWeight);
    const mid = rollWeight(fish, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(fish.minWeight);
    expect(mid).toBeLessThanOrEqual(fish.maxWeight);
  });

  it("rollFish is deterministic with an injected random", () => {
    const loc = LOCATIONS.find(l => l.id === "amazon")!;
    const a = rollFish(loc, 5, false, 2, () => 0.0);
    const b = rollFish(loc, 5, false, 2, () => 0.0);
    expect(a.id).toBe(b.id);
  });

  it("rollFish 4x lucky returns only abyssal+ when the pool has them", () => {
    const loc = LOCATIONS.find(l => getFishForLocation(l).some(f =>
      ["abyssal", "volcanic", "platinum", "legends", "cosmic"].includes(f.rarity)))!;
    const f = rollFish(loc, 5, true, 4, () => 0.01);
    expect(["abyssal", "volcanic", "platinum", "legends", "cosmic"]).toContain(f.rarity);
  });

  it("generates a bite delay between three and ten seconds", () => {
    for (let i = 0; i < 100; i += 1) {
      const wait = getWaitTime();
      expect(wait).toBeGreaterThanOrEqual(3000);
      expect(wait).toBeLessThanOrEqual(10000);
    }
  });
});
