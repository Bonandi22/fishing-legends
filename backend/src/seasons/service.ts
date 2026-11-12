export type Season = {
  id: string;
  seasonKey: string;
  name: string;
  status: 'scheduled' | 'active' | 'closed';
  startsAt: string;
  endsAt: string;
  rulesetVersion: string;
  minimumLevel: number;
};

export function createMemorySeasonsService() {
  const season: Season = {
    id: 'local-season-1',
    seasonKey: 'season-1',
    name: 'Fishing Legends Season 1',
    status: 'active',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    rulesetVersion: 'local-v1',
    minimumLevel: 1,
  };
  return {
    current() {
      return { season };
    },
  };
}
