import { ROD_SKINS } from './types';

export interface LeaderboardPlayer {
  rank: number;
  name: string;
  level: number;
  totalFishCaught: number;
  coins: number;
  skins: string[]; // skin ids
  multipliers: { luck: number; strength: number };
  country: string;
}

const NAMES = [
  'AquaKing', 'FishMaster', 'OceanLord', 'Harpooner', 'DeepDiver', 'WaveRider', 'SeaHunter', 'BluePearl',
  'CaptainHook', 'MarlinPro', 'TidalForce', 'CoralReef', 'SaltyDog', 'AbyssWalker', 'KrakenSlayer', 'NeptuneSon',
  'ReelDeal', 'BaitMaster', 'TrophyHunter', 'DeepBlue', 'StormFisher', 'PacificPro', 'AtlanticAce', 'RiverKing',
  'LakeMonster', 'BassLegend', 'PikeHunter', 'TunaTitan', 'SharkBait', 'WhaleWatcher', 'EelWrangler', 'CrabClaw',
  'SquidInk', 'SeaGhost', 'TidePuller', 'FoamRider', 'MoonFisher', 'StarCatcher', 'GoldenRod', 'SilverHook',
  'BronzeBait', 'IronAngler', 'SteelLine', 'CopperReel', 'EmeraldFin', 'RubyScale', 'SapphireWave', 'JadeKoi',
  'OnyxOrca', 'PearlDiver', 'AmberAngler', 'CrystalCarp', 'IcyTrout', 'FrozenFin', 'ArcticAngler', 'GlacierGill',
  'LavaLine', 'VolcanicVenom', 'PhoenixPescador', 'DragonRod', 'GriffinGill', 'PegasusPescador', 'MysticMariner',
  'RuneReel', 'SpellSinker', 'ArcaneAngler', 'WizardWave', 'ShamanShark', 'DruidDolphin', 'NinjaFisher', 'SamuraiSeer',
  'PirateKing', 'BuccaneerBob', 'CorsairCarl', 'PrivateerPete', 'AdmiralAnna', 'CaptainCora', 'BosunBart', 'SwabbieSam',
  'CabinCarlos', 'FirstMateFred', 'NavigatorNina', 'GunnerGreta', 'CookCarlos', 'ScribeSofia', 'LookoutLuna',
  'HelmsmanHugo', 'RiggerRyan', 'SailorSara', 'DeckhandDan', 'QuartermasterQuinn', 'BoatswainBea', 'MarinerMax',
  'SeafarerSky', 'VoyagerVic', 'ExplorerEli', 'WandererWill', 'NomadNico', 'RoamerRose', 'DrifterDax', 'AnglerAce',
];

const COUNTRIES = ['🇧🇷', '🇺🇸', '🇯🇵', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇬🇧', '🇨🇦', '🇦🇺', '🇲🇽', '🇦🇷', '🇵🇹', '🇰🇷', '🇨🇳'];

// Seeded random for stable ranking
function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached: LeaderboardPlayer[] | null = null;

export function getLeaderboard(): LeaderboardPlayer[] {
  if (cached) return cached;
  const rand = mulberry32(42);
  const skinIds = ROD_SKINS.map(s => s.id);

  const players: LeaderboardPlayer[] = NAMES.slice(0, 100).map((name, i) => {
    const score = Math.floor(50000 - i * 380 - rand() * 200);
    const numSkins = Math.max(1, Math.floor(rand() * (skinIds.length - 1)) + (i < 20 ? 4 : 1));
    const shuffled = [...skinIds].sort(() => rand() - 0.5).slice(0, numSkins);
    return {
      rank: i + 1,
      name,
      level: Math.max(1, 20 - Math.floor(i / 7)),
      totalFishCaught: score,
      coins: Math.floor(score * (5 + rand() * 5)),
      skins: shuffled,
      multipliers: {
        luck: Math.floor(rand() * (i < 30 ? 50 : 10)),
        strength: Math.floor(rand() * (i < 30 ? 50 : 10)),
      },
      country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
    };
  });

  cached = players;
  return players;
}

// Compute a "score" comparable with leaderboard (totalFishCaught)
export function getPlayerRank(playerFishCaught: number): number {
  const lb = getLeaderboard();
  // Find first rank where player's score is greater
  for (let i = 0; i < lb.length; i++) {
    if (playerFishCaught >= lb[i].totalFishCaught) return i + 1;
  }
  return lb.length + 1 + Math.max(0, 500 - playerFishCaught); // arbitrary lower rank
}
