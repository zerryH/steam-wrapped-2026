import { useState } from 'react';
import type { FormEvent } from 'react';

type SteamGame = {
  appid: number;
  name: string;
  hours: number;
};

type ReplayData = {
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

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function formatHours(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);
}

function normalizeProfile(value: string) {
  const input = value.trim();
  if (!input) throw new Error('Paste a Steam profile URL or SteamID64.');

  if (/^\d{17}$/.test(input)) {
    return 'https://steamcommunity.com/profiles/' + input + '/';
  }

  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.includes('/') && !candidate.includes(' ')) candidate = 'https://' + candidate;
    else if (!candidate.includes(' ')) return 'https://steamcommunity.com/id/' + encodeURIComponent(candidate) + '/';
    else throw new Error('Enter a Steam profile URL or custom profile name.');
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('That Steam profile link is not valid.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'steamcommunity.com') {
    throw new Error('Use a steamcommunity.com profile link.');
  }

  const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)/i);
  if (!match) throw new Error('Use a Steam /id/ or /profiles/ link.');

  return 'https://steamcommunity.com/' + match[1].toLowerCase() + '/' + match[2] + '/';
}

async function lookupSteamProfile(profileUrl: string): Promise<ReplayData> {
  const target = 'http://gamingprofileviewer.com/api/steam/replay?q=' + encodeURIComponent(profileUrl);
  const proxyUrl = 'https://r.jina.ai/' + target;

  const response = await fetch(proxyUrl, {
    method: 'GET',
    headers: {
      'X-Respond-With': 'text',
      'X-Engine': 'direct',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(response.status === 429 ? 'Too many lookups. Try again shortly.' : 'Steam lookup failed. Try again.');
  }

  const raw = await response.text();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Steam returned no readable public profile data.');

  let data: ReplayData;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as ReplayData;
  } catch {
    throw new Error('Steam returned an invalid response. Try again.');
  }

  if (!data.profile || !data.profile.steamid64 || !Array.isArray(data.topTitles)) {
    throw new Error('Profile not found or game details are private.');
  }

  if (!data.profile.isPublic) {
    throw new Error('This Steam profile is private.');
  }

  if (data.gamesOwned > 0 && data.totalHours === 0 && data.topTitles.length === 0 && data.recentTop?.length === 0) {
    throw new Error('Game details are hidden, or this library has no recorded playtime.');
  }

  return {
    ...data,
    topTitles: Array.isArray(data.topTitles) ? data.topTitles : [],
    recentTop: Array.isArray(data.recentTop) ? data.recentTop : [],
  };
}

function GameList({ games, emptyText }: { games: SteamGame[]; emptyText: string }) {
  const max = Math.max(1, ...games.map((game) => game.hours));

  if (!games.length) return <p className="empty-list">{emptyText}</p>;

  return (
    <ol className="game-list">
      {games.slice(0, 10).map((game, index) => (
        <li className="game-row" key={game.appid}>
          <span className="game-rank">{String(index + 1).padStart(2, '0')}</span>
          <div className="game-info">
            <div className="game-name-line">
              <strong>{game.name}</strong>
              <span>{formatHours(game.hours)} h</span>
            </div>
            <div className="game-bar">
              <span style={{ width: Math.max(2, game.hours / max * 100) + '%' }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const [profileInput, setProfileInput] = useState('');
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError('');
    setData(null);
    setLoading(true);

    try {
      const profileUrl = normalizeProfile(profileInput);
      const result = await lookupSteamProfile(profileUrl);
      setData(result);
      setProfileInput(profileUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this Steam profile.');
    } finally {
      setLoading(false);
    }
  }

  const mainGame = data?.topTitles[0];
  const recentGame = data?.recentTop[0];
  const joinedYear = data?.profile.createdAt
    ? new Date(data.profile.createdAt * 1000).getFullYear()
    : null;

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="#top">STEAM WRAPPED <span>2026</span></a>
        <span className="header-tag">PUBLIC PROFILE</span>
      </header>

      <section className="search-section" id="top">
        <h1>2026 Wrapped</h1>
        <form className="profile-form" onSubmit={submit}>
          <input
            value={profileInput}
            onChange={(event) => setProfileInput(event.target.value)}
            placeholder="Steam profile URL or SteamID64"
            aria-label="Steam profile URL or SteamID64"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'View wrap'}
          </button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      {loading && <div className="loading-line">Reading public Steam stats…</div>}

      {data && (
        <div className="results">
          <section className="profile-card">
            {data.profile.avatar && <img src={data.profile.avatar} alt="" />}
            <div className="profile-identity">
              <strong>{data.profile.personaName}</strong>
              <a href={data.profile.profileUrl} target="_blank" rel="noreferrer">Open Steam profile ↗</a>
            </div>
            {joinedYear && <span className="joined-year">Since {joinedYear}</span>}
          </section>

          <section className="stats-grid" aria-label="Steam statistics">
            <article>
              <span>Lifetime hours</span>
              <strong>{formatHours(data.totalHours)}</strong>
            </article>
            <article>
              <span>Games owned</span>
              <strong>{formatNumber(data.gamesOwned)}</strong>
            </article>
            <article>
              <span>Last 14 days</span>
              <strong>{formatHours(data.recentHours)} h</strong>
            </article>
            <article>
              <span>Played recently</span>
              <strong>{formatNumber(data.recentGamesPlayed)}</strong>
            </article>
          </section>

          <section className="wrap-section">
            <div className="section-heading">
              <h2>Your 2026 snapshot</h2>
              <span>LIVE DATA</span>
            </div>
            <div className="highlight-grid">
              <article>
                <span>Most played ever</span>
                <strong>{mainGame?.name ?? '—'}</strong>
                <small>{mainGame ? formatHours(mainGame.hours) + ' lifetime hours' : 'No game data'}</small>
              </article>
              <article>
                <span>Current main game</span>
                <strong>{recentGame?.name ?? '—'}</strong>
                <small>{recentGame ? formatHours(recentGame.hours) + ' hours in the last 14 days' : 'No recent game data'}</small>
              </article>
            </div>
          </section>

          <section className="games-grid">
            <div className="games-panel">
              <div className="section-heading">
                <h2>Top games</h2>
                <span>ALL TIME</span>
              </div>
              <GameList games={data.topTitles} emptyText="No playtime data." />
            </div>
            <div className="games-panel">
              <div className="section-heading">
                <h2>Recently played</h2>
                <span>LAST 14 DAYS</span>
              </div>
              <GameList games={data.recentTop} emptyText="No recent games." />
            </div>
          </section>

          <p className="data-note">Public Steam data provides lifetime and recent playtime, not exact January–December 2026 hours.</p>
        </div>
      )}
    </main>
  );
}

