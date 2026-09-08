import { describe, expect, it } from "vitest";
import { getXpForLevel, PlayerState } from "@/game/types";
import { parseSavedState, SAVE_SCHEMA_VERSION, serializePlayerState } from "@/game/persistence";

const fallback: PlayerState = {
  level: 1,
  xp: 0,
  xpToNextLevel: getXpForLevel(1),
  totalFishCaught: 0,
  collection: [],
  unlockedLocations: ["amazon"],
  heaviestFish: null,
  warehouse: [],
  coins: 0,
  activeSkin: "default",
  ownedSkins: ["default"],
  activeBoatSkin: "classic",
  ownedBoatSkins: ["classic"],
  luckMultiplierEnd: null,
  strengthMultiplierEnd: null,
  lastRouletteDate: null,
  aquariumWarehouse: [],
  aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null,
  dailyGiftsDay: 1,
  dailyGiftsWeek: 1,
  nets: 10,
};

describe("save persistence", () => {
  it("writes a versioned envelope", () => {
    expect(JSON.parse(serializePlayerState(fallback))).toMatchObject({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: { activeSkin: "default" },
    });
  });

  it("loads legacy raw PlayerState saves", () => {
    const loaded = parseSavedState(JSON.stringify(fallback), fallback);
    expect(loaded.level).toBe(1);
    expect(loaded.nets).toBe(10);
  });

  it("round-trips the lucky-mode fields, and loads a save without them", () => {
    const withLucky = parseSavedState(
      JSON.stringify({ ...fallback, luckyUntil: 1_060_000, luckyCooldownUntil: 1_420_000 }),
      fallback,
    );
    expect(withLucky.luckyUntil).toBe(1_060_000);
    expect(withLucky.luckyCooldownUntil).toBe(1_420_000);

    const without = parseSavedState(JSON.stringify(fallback), fallback);
    expect(without.level).toBe(1);
  });

  it("rejects malformed saves without corrupting the fallback", () => {
    const loaded = parseSavedState(JSON.stringify({ level: "not-a-number" }), fallback);
    expect(loaded).toEqual(fallback);
  });

  it("normalizes duplicate skins and invalid active skin", () => {
    const loaded = parseSavedState(JSON.stringify({
      ...fallback,
      ownedSkins: ["default", "default"],
      activeSkin: "missing",
    }), fallback);

    expect(loaded.ownedSkins).toEqual(["default"]);
    expect(loaded.activeSkin).toBe("default");
  });

  it("accepts catches whose location is the submarine pseudo-location", () => {
    const tilapia = {
      fish: { id: "tilapia", name: "Tilápia", rarity: "common", waterType: "freshwater",
              minWeight: 0.3, maxWeight: 2.5, xp: 10, description: "", emoji: "🐟" },
      weight: 1, location: "submarine", timestamp: 1,
    };
    const loaded = parseSavedState(JSON.stringify({ ...fallback, warehouse: [tilapia] }), fallback);
    expect(loaded.warehouse).toHaveLength(1);
    expect(loaded.warehouse[0].location).toBe("submarine");
  });

  it("still rejects catches with an unknown location", () => {
    const tilapia = {
      fish: { id: "tilapia", name: "Tilápia", rarity: "common", waterType: "freshwater",
              minWeight: 0.3, maxWeight: 2.5, xp: 10, description: "", emoji: "🐟" },
      weight: 1, location: "atlantis", timestamp: 1,
    };
    expect(parseSavedState(JSON.stringify({ ...fallback, warehouse: [tilapia] }), fallback)).toEqual(fallback);
  });

  it("rejects catches with unknown catalog ids or impossible weights", () => {
    const invalidCatch = {
      fish: {
        id: "unknown",
        name: "Invalid",
        rarity: "common",
        waterType: "freshwater",
        minWeight: 1,
        maxWeight: 2,
        xp: 1,
        description: "",
        emoji: "🐟",
      },
      weight: 1,
      location: "amazon",
      timestamp: 1,
    };

    expect(parseSavedState(JSON.stringify({
      ...fallback,
      collection: [invalidCatch],
    }), fallback)).toEqual(fallback);
  });
});
