export type SteamStat = {
  name: string;
  value: number | string;
  displayName?: string;
};

export type Game = {
  appId: number;
  name: string;
  playtimeForeverHours: number;
  playtime2WeeksHours: number;
  trackedYearHours: number;
  iconUrl?: string;
  achievements?: { unlocked: number; total: number; percent: number } | null;
  stats?: SteamStat[];
  statsAvailable?: boolean;
};

export type WrappedData = {
  schemaVersion: number;
  generatedAt: string;
  year: number;
  source: 'steam-api' | 'demo';
  profile: {
    steamId: string;
    name: string;
    avatar?: string;
    url: string;
  };
  summary: {
    totalGames: number;
    lifetimeHours: number;
    trackedYearHours: number;
    achievementUnlocked: number;
    achievementTotal: number;
  };
  tracking: {
    coverageStart: string;
    coverageEnd: string;
    isFullYear: boolean;
    note: string;
  };
  games: Game[];
};
