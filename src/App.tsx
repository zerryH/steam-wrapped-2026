import { flushSync } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { makeBanter } from './data/banter';
import { trackProgress } from './lib/history';
import type { ProgressResult, ReplayData, SteamGame } from './lib/types';

type StoryRow = {
  appid: number;
  label: string;
  value: string;
};

type StorySlide = {
  key: string;
  title: string;
  big: string;
  unit: string;
  comment: string;
  heroGame?: SteamGame;
  artwork?: SteamGame[];
  rows?: StoryRow[];
};

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const hourFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatNumber(value: number): string {
  return numberFormat.format(Number.isFinite(value) ? value : 0);
}

function formatHours(value: number): string {
  return hourFormat.format(Number.isFinite(value) ? value : 0);
}

function cleanGames(games: SteamGame[] | undefined): SteamGame[] {
  return (Array.isArray(games) ? games : [])
    .filter((game) => game && Number.isFinite(game.appid) && typeof game.name === 'string')
    .map((game) => ({
      appid: Number(game.appid),
      name: game.name,
      hours: Math.max(0, Number.isFinite(game.hours) ? game.hours : 0),
    }))
    .sort((a, b) => b.hours - a.hours);
}

function normalizeProfile(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Paste a Steam profile URL or SteamID64.');

  if (/^\d{17}$/.test(input)) {
    return 'https://steamcommunity.com/profiles/' + input + '/';
  }

  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.includes('/') && !candidate.includes(' ')) candidate = 'https://' + candidate;
    else if (!candidate.includes(' ')) {
      return 'https://steamcommunity.com/id/' + encodeURIComponent(candidate) + '/';
    } else {
      throw new Error('Use a Steam profile URL, custom profile name, or 17-digit SteamID64.');
    }
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('That profile link is not valid.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'steamcommunity.com') {
    throw new Error('Use a steamcommunity.com profile link.');
  }

  const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)/i);
  if (!match) throw new Error('Use a Steam /id/ or /profiles/ profile link.');

  return 'https://steamcommunity.com/' + match[1].toLowerCase() + '/' + match[2] + '/';
}

async function lookupSteamProfile(profileUrl: string): Promise<ReplayData> {
  const target = 'http://gamingprofileviewer.com/api/steam/replay?q=' + encodeURIComponent(profileUrl);
  const response = await fetch('https://r.jina.ai/' + target, {
    method: 'GET',
    headers: {
      'X-Respond-With': 'text',
      'X-Engine': 'direct',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many lookups right now. Try again shortly.');
    throw new Error('Steam lookup failed. Try again.');
  }

  const raw = await response.text();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Steam returned no readable public profile data.');

  let data: ReplayData;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as ReplayData;
  } catch {
    throw new Error('Steam returned an unreadable response. Try again.');
  }

  if (!data.profile?.steamid64 || !Array.isArray(data.topTitles)) {
    throw new Error('Profile not found, or its game details are private.');
  }
  if (data.profile.isPublic === false) throw new Error('This Steam profile is private.');

  const topTitles = cleanGames(data.topTitles);
  const recentTop = cleanGames(data.recentTop);
  const totalHours = Math.max(0, Number(data.totalHours) || 0);

  if ((Number(data.gamesOwned) || 0) > 0 && totalHours === 0 && topTitles.length === 0 && recentTop.length === 0) {
    throw new Error('Game details are hidden, or this library has no recorded playtime.');
  }

  return {
    ...data,
    gamesOwned: Math.max(0, Number(data.gamesOwned) || 0),
    totalHours,
    recentHours: Math.max(0, Number(data.recentHours) || 0),
    recentGamesPlayed: Math.max(0, Number(data.recentGamesPlayed) || 0),
    topTitles,
    recentTop,
  };
}

function highestMilestone(hours: number): number {
  const marks = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  return marks.filter((mark) => hours >= mark).pop() || 0;
}

function nextMilestone(hours: number): number {
  const marks = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  return marks.find((mark) => mark > hours) || (Math.floor(hours / 5000) + 1) * 5000;
}

function getPlayerType(gamesOwned: number, mainShare: number, gameCount: number): string {
  if (gamesOwned >= 500) return 'The collector';
  if (mainShare >= 55) return 'The specialist';
  if (gameCount >= 7 && mainShare <= 32) return 'The sampler';
  return 'The regular';
}

function buildSlides(data: ReplayData, progress: ProgressResult): StorySlide[] {
  const games = cleanGames(data.topTitles);
  const recent = cleanGames(data.recentTop).slice(0, 4);
  const main = games[0];
  const topHours = games.reduce((sum, game) => sum + game.hours, 0);
  const mainShare = main && topHours > 0 ? Math.round((main.hours / topHours) * 100) : 0;
  const playerType = getPlayerType(data.gamesOwned, mainShare, games.length);
  const createdYear = data.profile.createdAt ? new Date(data.profile.createdAt * 1000).getFullYear() : null;
  const next = main ? nextMilestone(main.hours) : 0;
  const remaining = main ? Math.max(0, next - main.hours) : 0;
  const id = data.profile.steamid64;
  const rows = (items: SteamGame[]): StoryRow[] => items.slice(0, 4).map((game) => ({
    appid: game.appid,
    label: game.name,
    value: formatHours(game.hours) + ' h',
  }));
  const milestoneRows: StoryRow[] = games.slice(0, 4).map((game) => {
    const reached = highestMilestone(game.hours);
    const target = nextMilestone(game.hours);
    return {
      appid: game.appid,
      label: game.name,
      value: reached
        ? formatNumber(reached) + 'h · ' + formatHours(Math.max(0, target - game.hours)) + 'h left'
        : formatHours(Math.max(0, target - game.hours)) + 'h to go',
    };
  });
  const recentHoursValid = data.recentHours > 0 && data.recentHours <= 336;
  const changedRows: StoryRow[] = progress.changes.slice(0, 4).map((game) => ({
    appid: game.appid,
    label: game.name,
    value: '+' + formatHours(game.addedHours) + ' h',
  }));

  return [
    {
      key: 'hello',
      title: 'Your profile',
      big: data.profile.personaName || 'Player',
      unit: (createdYear ? 'Member since ' + createdYear : 'Steam player') + ' · ' + formatNumber(data.gamesOwned) + ' games',
      comment: makeBanter(id, 'hello', String(data.gamesOwned) + ':' + formatHours(data.totalHours)),
      artwork: games.slice(0, 4),
    },
    {
      key: 'main',
      title: 'Most played',
      big: main ? formatHours(main.hours) + ' h' : '—',
      unit: main ? main.name : 'No public game data',
      comment: makeBanter(id, 'main', main ? main.appid + ':' + formatHours(main.hours) : 'empty'),
      heroGame: main,
    },
    {
      key: 'type',
      title: 'Player type',
      big: playerType,
      unit: main ? mainShare + '% of your top-game hours · ' + main.name : 'Based on your public game list',
      comment: makeBanter(id, 'type', playerType + ':' + mainShare),
      artwork: games.slice(0, 3),
    },
    {
      key: 'ranking',
      title: 'Most-played games',
      big: formatHours(topHours) + ' h',
      unit: 'across your top ' + formatNumber(games.length),
      comment: makeBanter(id, 'ranking', games.map((game) => game.appid).join(':')),
      rows: rows(games),
    },
    {
      key: 'milestones',
      title: 'Next milestone',
      big: main ? formatHours(remaining) + ' h' : '—',
      unit: main ? 'to ' + formatNumber(next) + ' h · ' + main.name : 'No top game',
      comment: makeBanter(id, 'milestones', main ? main.appid + ':' + next + ':' + formatHours(main.hours) : 'empty'),
      rows: milestoneRows,
      heroGame: main,
    },
    {
      key: 'shelf',
      title: 'Your library',
      big: formatNumber(data.gamesOwned),
      unit: 'games owned',
      comment: makeBanter(id, 'shelf', String(data.gamesOwned)),
      artwork: games.slice(0, 6),
    },
    {
      key: 'recent',
      title: 'Recently played',
      big: recentHoursValid ? formatHours(data.recentHours) + ' h' : formatNumber(data.recentGamesPlayed),
      unit: recentHoursValid ? 'last 14 days' : 'recent games',
      comment: makeBanter(id, 'recent', recent.map((game) => game.appid).join(':') + ':' + data.recentGamesPlayed),
      rows: recent.map((game) => ({ appid: game.appid, label: game.name, value: 'Recent' })),
      artwork: recent,
    },
    {
      key: 'progress',
      title: 'Since last visit',
      big: progress.first ? 'New' : progress.totalGain !== null ? '+' + formatHours(progress.totalGain) + ' h' : '—',
      unit: progress.first ? 'baseline' : 'tracked playtime',
      comment: makeBanter(id, 'progress', String(progress.totalGain) + ':' + progress.changes.map((game) => game.appid).join(':')),
      rows: changedRows,
      artwork: progress.changes.length
        ? progress.changes.slice(0, 4).map((game) => ({ appid: game.appid, name: game.name, hours: game.addedHours }))
        : games.slice(0, 4),
    },
    {
      key: 'outro',
      title: 'That’s a wrap',
      big: formatNumber(data.gamesOwned),
      unit: 'games · ' + formatHours(data.totalHours) + ' lifetime hours',
      comment: makeBanter(id, 'outro', String(data.totalHours) + ':' + data.profile.personaName),
      heroGame: main,
    },
  ];
}

function GameArt({ game, variant = 'poster' }: {
  game: SteamGame;
  variant?: 'hero' | 'poster' | 'row';
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const id = game.appid;
  const base = 'https://shared.steamstatic.com/store_item_assets/steam/apps/' + id + '/';
  const sources = variant === 'hero'
    ? [base + 'library_hero_2x.jpg', base + 'library_hero.jpg', 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/' + id + '/library_hero.jpg', base + 'header.jpg', 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/header.jpg']
    : variant === 'poster'
      ? [base + 'library_600x900_2x.jpg', base + 'library_600x900.jpg', base + 'header.jpg', 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/header.jpg']
      : [base + 'header.jpg', 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/' + id + '/header.jpg', 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/header.jpg'];

  if (failed || !id) return <span className="art-fallback" aria-hidden="true" />;
  return (
    <img
      src={sources[sourceIndex]}
      alt={game.name}
      loading={variant === 'hero' ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (sourceIndex < sources.length - 1) setSourceIndex((current) => current + 1);
        else setFailed(true);
      }}
    />
  );
}

function GameRows({ rows }: { rows: StoryRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="story-rows">
      {rows.map((row) => (
        <div className="story-row" key={row.appid + ':' + row.label}>
          <div className="row-art">
            <GameArt game={{ appid: row.appid, name: row.label, hours: 0 }} variant="row" />
          </div>
          <span className="row-name">{row.label}</span>
          <strong className="row-value">{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

type DocumentWithTransitions = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export default function App() {
  const [profileInput, setProfileInput] = useState('');
  const [data, setData] = useState<ReplayData | null>(null);
  const [progress, setProgress] = useState<ProgressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'back'>('forward');

  const slides = useMemo(
    () => data && progress ? buildSlides(data, progress) : [],
    [data, progress],
  );
  const slide = slides[slideIndex];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const profileUrl = normalizeProfile(profileInput);
      const result = await lookupSteamProfile(profileUrl);
      const progressResult = trackProgress(result);
      setData(result);
      setProgress(progressResult);
      setSlideIndex(0);
      setShowSearch(false);
      setProfileInput(profileUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this Steam profile.');
    } finally {
      setLoading(false);
    }
  }

  function startNewProfile() {
    setShowSearch(true);
    setData(null);
    setProgress(null);
    setSlideIndex(0);
    setError('');
  }

  function transitionTo(nextIndex: number, direction: 'forward' | 'back') {
    if (nextIndex === slideIndex || nextIndex < 0 || nextIndex >= slides.length) return;
    setSlideDirection(direction);
    document.documentElement.dataset.slideDirection = direction;
    document.documentElement.dataset.slide = slides[nextIndex]?.key || 'hello';
    const update = () => flushSync(() => setSlideIndex(nextIndex));
    const doc = document as DocumentWithTransitions;
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doc.startViewTransition(update);
    } else {
      update();
    }
  }

  function goNext() {
    transitionTo(slideIndex + 1, 'forward');
  }

  function goBack() {
    transitionTo(slideIndex - 1, 'back');
  }

  useEffect(() => {
    if (showSearch || !data) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        transitionTo(slideIndex + 1, 'forward');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        transitionTo(slideIndex - 1, 'back');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data, showSearch, slideIndex, slides.length]);

  return (
    <main className="page-shell">
      {!showSearch && (
        <header className="site-header">
          <a className="wordmark" href="#top" onClick={startNewProfile}>STEAM WRAPPED</a>
          <button className="text-button" type="button" onClick={startNewProfile}>Change profile</button>
        </header>
      )}

      {showSearch ? (
        <section className="landing" id="top">
          <div className="landing-inner">
            <h1>STEAM<br /><span>WRAPPED</span></h1>
            <form className="profile-form" onSubmit={submit}>
              <label className="visually-hidden" htmlFor="steam-profile">Steam profile URL or SteamID64</label>
              <input
                id="steam-profile"
                value={profileInput}
                onChange={(event) => setProfileInput(event.target.value)}
                placeholder="Steam profile URL or SteamID64"
                autoComplete="off"
                spellCheck={false}
                aria-label="Steam profile URL or SteamID64"
                required
              />
              <button type="submit" disabled={loading} aria-label="Build wrap">
                {loading ? 'Loading' : 'Open wrap'}
                <span aria-hidden="true">↗</span>
              </button>
              {error && <p className="error-message" role="alert">{error}</p>}
            </form>
          </div>
        </section>
      ) : data && progress && slide ? (
        <section className="story-player" aria-label="Steam Wrapped story">
          <div className="story-heading">
            <div className="story-person">
              {data.profile.avatar && <img src={data.profile.avatar} alt="" />}
              <strong>{data.profile.personaName}</strong>
            </div>
          </div>

          <article
            className={'story-slide slide-' + slide.key + ' ' + (slideDirection === 'back' ? 'is-back' : 'is-forward')}
            data-slide={slide.key}
            key={slide.key + '-' + slideIndex}
          >
            <div className="slide-backdrop">
              {slide.heroGame && (
                <div className="slide-hero-art" key={'hero-' + slide.heroGame.appid}>
                  <GameArt game={slide.heroGame} variant="hero" />
                </div>
              )}
              {slide.artwork && slide.artwork.length > 0 && (
                <div className={'artwork-mosaic mosaic-' + slide.key}>
                  {slide.artwork.slice(0, 6).map((game) => (
                    <div className="art-card" key={game.appid}>
                      <GameArt game={game} variant="poster" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="slide-content">
              <h1>{slide.title}</h1>
              <div className="slide-stat-block">
                <div className="slide-stat">{slide.big}</div>
                <div className="slide-unit">{slide.unit}</div>
              </div>
              {slide.rows && <GameRows rows={slide.rows} />}
              <p className="slide-comment">{slide.comment}</p>
            </div>
          </article>

          <div className="story-controls">
            <button className="nav-button" type="button" onClick={goBack} disabled={slideIndex === 0} aria-label="Previous slide">
              <span aria-hidden="true">←</span>
            </button>
            <button
              className="nav-button nav-next"
              type="button"
              onClick={() => slideIndex === slides.length - 1 ? transitionTo(0, 'back') : goNext()}
              aria-label={slideIndex === slides.length - 1 ? 'Replay wrap' : 'Next slide'}
            >
              <span aria-hidden="true">{slideIndex === slides.length - 1 ? '↻' : '→'}</span>
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
