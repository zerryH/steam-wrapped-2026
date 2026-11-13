export type SteamGame = {
  appid: number;
  name: string;
  hours: number;
};

export type ReplayData = {
  profile: {
    steamid64: string;
    personaName: string;
    profileUrl: string;
    avatar?: string;
    avatarMedium?: string;
    createdAt?: number;
    isPublic?: boolean;
  };
  gamesOwned: number;
  totalHours: number;
  recentHours: number;
  recentGamesPlayed: number;
  topTitles: SteamGame[];
  recentTop: SteamGame[];
};

export type ProgressGameChange = {
  appid: number;
  name: string;
  addedHours: number;
};

export type ProgressResult = {
  first: boolean;
  storageEnabled: boolean;
  totalGain: number | null;
  changes: ProgressGameChange[];
  crossedMilestones: string[];
  comparedAt?: number;
};