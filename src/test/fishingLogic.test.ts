import { describe, expect, it, vi } from "vitest";
import { getFishForLocation, LOCATIONS } from "@/game/data";
import { RARITY_CONFIG } from "@/game/types";
import { getWaitTime, rollFish, rollWeight } from "@/game/fishingLogic";

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

  it("keeps generated weights within the fish range", () => {
    const location = LOCATIONS.find((item) => item.id === "amazon");
    const fish = rollFish(location!, 1);
    const weight = rollWeight(fish);

    expect(weight).toBeGreaterThanOrEqual(fish.minWeight);
    expect(weight).toBeLessThanOrEqual(fish.maxWeight);
  });

  it("generates a bite delay between three and ten seconds", () => {
    for (let i = 0; i < 100; i += 1) {
      const wait = getWaitTime();
      expect(wait).toBeGreaterThanOrEqual(3000);
      expect(wait).toBeLessThanOrEqual(10000);
    }
  });
});
