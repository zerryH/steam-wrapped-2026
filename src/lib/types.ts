export type SteamStat = {
  name: string;
  value: number | string;
  displayName?: string;
};

export type AchievementEvent = {
  appId: number;
  gameName: string;
  apiName: string;
  displayName: string;
  unlockTime: number;
  date: string;
};

export type Game = {
  appId: number;
  name: string;
  playtimeForeverHours: number;
  playtime2WeeksHours: number;
  yearHoursExact: number | null;
  yearSessions: number;
  yearActiveDays: number;
  longestSessionSeconds: number;
  iconUrl?: string;
  achievements?: { unlocked: number; total: number; percent: number } | null;
  achievements2026: number;
  stats?: SteamStat[];
  statsAvailable?: boolean;
};

export type MonthActivity = {
  month: number;
  name: string;
  hours: number;
  sessions: number;
  achievements: number;
  activeDays: number;
};

export type WrappedData = {
  schemaVersion: number;
  generatedAt: string;
  year: number;
  yearToDate: {
    start: string;
    end: string;
    startMonth: number;
    endMonth: number;
    label: string;
  };
  source: 'steam-api' | 'setup';
  profile: {
    steamId: string;
    name: string;
    avatar?: string;
    url: string;
  };
  summary: {
    totalGames: number;
    lifetimeHours: number;
    yearHoursExact: number | null;
    yearSessions: number;
    yearActiveDays: number;
    averageHoursPerActiveDay: number | null;
    continuousDaysEquivalent: number;
    eightHourDaysEquivalent: number;
    sessionActiveDays: number;
    achievementActiveDays: number;
    activeGames2026: number;
    achievementUnlocked2026: number;
    achievementsScanned: number;
    achievementsAvailable: number;
    averageSessionMinutes: number | null;
    longestSessionSeconds: number | null;
    mostPlayedWeekday: string | null;
    busiestMonth: string | null;
    topSessionGame: string | null;
  };
  history: {
    sessionLogsFound: boolean;
    sessionLogFiles: string[];
    sessionCount: number;
    firstSession: string | null;
    lastSession: string | null;
    achievementGamesScanned: number;
    achievementGamesTotal: number;
    note: string;
  };
  activity: {
    monthly: MonthActivity[];
    daily: { date: string; minutes: number }[];
    weekdayHours: { day: string; hours: number }[];
    achievements: AchievementEvent[];
  };
  topSessionGameAppId: number | null;
  thunderSkill?: { nickname: string; profileUrl: string; yearCompareUrl: string } | null;
  games: Game[];
};
