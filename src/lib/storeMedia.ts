import type { SteamGame } from './types';

export type SteamStoreArt = {
  headerImage: string | null;
  screenshots: string[];
  fetchedAt: number;
};

type SteamStorePayload = {
  [appid: string]: {
    success?: boolean;
    data?: {
      header_image?: string;
      screenshots?: Array<{ path_full?: string }>;
    };
  };
};

const CACHE_PREFIX = 'steam-wrapped-store-art-v2:';
const CACHE_TTL = 12 * 60 * 60 * 1000;
const inFlight = new Map<number, Promise<SteamStoreArt | null>>();

function readCache(appid: number): SteamStoreArt | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + appid);
    if (!raw) return null;
    const item = JSON.parse(raw) as SteamStoreArt;
    if (
      !item ||
      !Number.isFinite(item.fetchedAt) ||
      Date.now() - item.fetchedAt > CACHE_TTL ||
      (!item.headerImage && !item.screenshots?.length)
    ) return null;
    return item;
  } catch {
    return null;
  }
}

function writeCache(appid: number, art: SteamStoreArt): void {
  try {
    localStorage.setItem(CACHE_PREFIX + appid, JSON.stringify(art));
  } catch {
    // Storage can be unavailable or full; images still work for this visit.
  }
}

async function requestStoreArt(appid: number): Promise<SteamStoreArt | null> {
  const cached = readCache(appid);
  if (cached) return cached;

  const current = inFlight.get(appid);
  if (current) return current;

  const task = (async (): Promise<SteamStoreArt | null> => {
    const storeUrl =
      'https://store.steampowered.com/api/appdetails?appids=' +
      appid +
      '&l=english&filters=basic%2Cscreenshots';

    try {
      // Steam's public Store endpoint needs no account or API key.
      // The public CORS relay only makes that endpoint readable from a static GitHub Pages site.
      const response = await fetch('https://proxy.cors.dev/' + storeUrl, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as SteamStorePayload;
      const data = payload[String(appid)]?.data;
      if (!payload[String(appid)]?.success || !data) return null;

      const art: SteamStoreArt = {
        headerImage: data.header_image || null,
        screenshots: (data.screenshots || [])
          .map((shot) => shot.path_full)
          .filter((url): url is string => typeof url === 'string' && url.startsWith('https://')),
        fetchedAt: Date.now(),
      };

      if (!art.headerImage && art.screenshots.length === 0) return null;
      writeCache(appid, art);
      return art;
    } catch {
      return null;
    }
  })();

  inFlight.set(appid, task);
  try {
    return await task;
  } finally {
    inFlight.delete(appid);
  }
}

export async function fetchSteamStoreArtBatch(
  games: SteamGame[],
  onItem?: (appid: number, art: SteamStoreArt) => void,
): Promise<Record<number, SteamStoreArt>> {
  const ids = [...new Set(games.map((game) => game.appid).filter((id) => Number.isFinite(id) && id > 0))]
    .slice(0, 18);
  const result: Record<number, SteamStoreArt> = {};
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      const appid = ids[index];
      const art = await requestStoreArt(appid);
      if (art) {
        result[appid] = art;
        onItem?.(appid, art);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()));
  return result;
}
