import type { ProgressResult, ReplayData } from './types';

type SavedSnapshot = {
  capturedAt: number;
  totalHours: number;
  games: Array<{ appid: number; name: string; hours: number }>;
};

const PLAYTIME_MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function trackProgress(data: ReplayData): ProgressResult {
  const firstRun: ProgressResult = {
    first: true,
    storageEnabled: true,
    totalGain: null,
    changes: [],
    crossedMilestones: [],
  };

  if (typeof window === 'undefined') {
    return { ...firstRun, storageEnabled: false };
  }

  const key = 'steam-wrapped-history-v1:' + data.profile.steamid64;
  const current: SavedSnapshot = {
    capturedAt: Date.now(),
    totalHours: Number.isFinite(data.totalHours) ? data.totalHours : 0,
    games: (data.topTitles || []).map((game) => ({
      appid: game.appid,
      name: game.name,
      hours: Number.isFinite(game.hours) ? game.hours : 0,
    })),
  };

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    const snapshots: SavedSnapshot[] = Array.isArray(parsed) ? parsed : [];
    const previous = snapshots.length ? snapshots[snapshots.length - 1] : null;

    const result: ProgressResult = previous
      ? {
          first: false,
          storageEnabled: true,
          totalGain: current.totalHours >= previous.totalHours
            ? current.totalHours - previous.totalHours
            : null,
          changes: [],
          crossedMilestones: [],
          comparedAt: previous.capturedAt,
        }
      : firstRun;

    if (previous) {
      const oldGames = new Map(previous.games.map((game) => [game.appid, game]));

      result.changes = current.games
        .map((game) => {
          const old = oldGames.get(game.appid);
          if (!old) return null;
          const addedHours = game.hours - old.hours;
          return addedHours > 0.05
            ? { appid: game.appid, name: game.name, addedHours }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.addedHours - a.addedHours);

      current.games.forEach((game) => {
        const old = oldGames.get(game.appid);
        if (!old) return;
        PLAYTIME_MILESTONES.forEach((mark) => {
          if (old.hours < mark && game.hours >= mark) {
            result.crossedMilestones.push(game.name + ' passed ' + mark.toLocaleString() + ' hours');
          }
        });
      });
    }

    window.localStorage.setItem(key, JSON.stringify([...snapshots, current].slice(-24)));
    return result;
  } catch {
    return { ...firstRun, storageEnabled: false };
  }
}