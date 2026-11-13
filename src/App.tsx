import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { makeBanter } from './data/banter';
import { trackProgress } from './lib/history';
import type { ProgressResult, ReplayData, SteamGame } from './lib/types';

type StoryRow = {
  label: string;
  value: string;
  detail?: string;
};

type StorySlide = {
  key: string;
  eyebrow: string;
  title: string;
  big: string;
  unit: string;
  description: string;
  comment: string;
  note?: string;
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
  const topTenHours = games.reduce((sum, game) => sum + game.hours, 0);
  const mainShare = main && topTenHours > 0 ? Math.round((main.hours / topTenHours) * 100) : 0;
  const playerType = getPlayerType(data.gamesOwned, mainShare, games.length);
  const createdYear = data.profile.createdAt
    ? new Date(data.profile.createdAt * 1000).getFullYear()
    : null;
  const next = main ? nextMilestone(main.hours) : 0;
  const remaining = main ? Math.max(0, next - main.hours) : 0;
  const id = data.profile.steamid64;
  const rows = (items: SteamGame[]): StoryRow[] => items.slice(0, 4).map((game, index) => ({
    label: game.name,
    value: formatHours(game.hours) + ' h',
    detail: 'No. ' + (index + 1),
  }));

  const milestoneRows = games.slice(0, 4).map((game) => {
    const reached = highestMilestone(game.hours);
    const target = nextMilestone(game.hours);
    return {
      label: game.name,
      value: reached ? formatNumber(reached) + 'h club' : 'Building up',
      detail: reached
        ? formatHours(Math.max(0, target - game.hours)) + 'h to ' + formatNumber(target) + 'h'
        : formatHours(Math.max(0, target - game.hours)) + 'h to first mark',
    };
  });

  const recentHoursValid = data.recentHours > 0 && data.recentHours <= 336;
  const recentBig = recentHoursValid
    ? formatHours(data.recentHours)
    : formatNumber(data.recentGamesPlayed);
  const recentUnit = recentHoursValid
    ? 'hours reported in the last 14 days'
    : 'games in your recent activity feed';

  const changedRows: StoryRow[] = progress.changes.slice(0, 4).map((game) => ({
    label: game.name,
    value: '+' + formatHours(game.addedHours) + ' h',
    detail: 'since last check',
  }));

  const slides: StorySlide[] = [
    {
      key: 'hello',
      eyebrow: 'THE PROFILE',
      title: 'A little look at your Steam life.',
      big: data.profile.personaName || 'Player',
      unit: (createdYear ? 'ON STEAM SINCE ' + createdYear : 'YOUR STEAM PROFILE') + ' · ' + formatNumber(data.gamesOwned) + ' GAMES',
      description: 'A personal read of the public stats your profile actually shows.',
      comment: makeBanter(id, 'hello', String(data.gamesOwned) + ':' + formatHours(data.totalHours)),
      note: 'One profile. No login. No API key.',
    },
    {
      key: 'main',
      eyebrow: 'THE MAIN CHARACTER',
      title: main ? 'One game kept getting the call.' : 'Your top game is still a mystery.',
      big: main ? main.name : 'No game data',
      unit: main ? formatHours(main.hours) + ' lifetime hours' : 'No public playtime found',
      description: main
        ? 'That is roughly ' + formatNumber(Math.floor(main.hours / 24)) + ' full days in one game.'
        : 'Your public profile did not return a top-played title.',
      comment: makeBanter(id, 'main', main ? main.appid + ':' + formatHours(main.hours) : 'empty'),
    },
    {
      key: 'type',
      eyebrow: 'YOUR PLAYER TYPE',
      title: 'There is a pattern to your library.',
      big: playerType,
      unit: 'BASED ON YOUR TOP ' + formatNumber(games.length) + ' TITLES',
      description: main
        ? 'Your leading game makes up ' + mainShare + '% of the playtime in the top titles shown. ' +
          (mainShare >= 55 ? 'That is a serious main.' : mainShare <= 32 ? 'You spread the hours around.' : 'A favourite, with room for others.')
        : 'The public game list is too small to call it.',
      comment: makeBanter(id, 'type', playerType + ':' + mainShare),
      note: 'This compares the returned top titles, not your entire library.',
    },
    {
      key: 'ranking',
      eyebrow: 'THE LEADERBOARD',
      title: 'The hours have a pecking order.',
      big: games.length ? 'TOP ' + Math.min(3, games.length) : 'NO RANKING',
      unit: 'BY LIFETIME PLAYTIME',
      description: games.length
        ? 'Here are the titles that have taken the biggest share of your time.'
        : 'No game ranking was available for this profile.',
      comment: makeBanter(id, 'ranking', games.map((game) => game.appid).join(':')),
      rows: rows(games),
    },
    {
      key: 'milestones',
      eyebrow: 'TIME MILESTONES',
      title: main ? 'Your next checkpoint is in sight.' : 'Your next checkpoint starts here.',
      big: main ? formatHours(remaining) + ' h' : '—',
      unit: main ? 'UNTIL ' + formatNumber(next) + ' HOURS IN ' + main.name.toUpperCase() : 'NO TOP GAME FOUND',
      description: main
        ? 'You have already logged ' + formatHours(main.hours) + ' hours in your leading game.'
        : 'Add public playtime and this slide will calculate the next milestone.',
      comment: makeBanter(id, 'milestones', main ? main.appid + ':' + next + ':' + formatHours(main.hours) : 'empty'),
      rows: milestoneRows,
      note: 'These are calculated playtime milestones, not Steam achievement unlocks.',
    },
    {
      key: 'shelf',
      eyebrow: 'THE COLLECTION',
      title: 'The shelf is getting crowded.',
      big: formatNumber(data.gamesOwned),
      unit: 'GAMES OWNED',
      description: data.gamesOwned >= 500
        ? 'That is a collection with its own backlog.'
        : data.gamesOwned >= 100
          ? 'Plenty to choose from. The hard part is picking one.'
          : 'A focused shelf. Every install has a reason.',
      comment: makeBanter(id, 'shelf', String(data.gamesOwned)),
      note: 'The public lookup reports the owned-game count; it does not return every game in the library.',
    },
    {
      key: 'recent',
      eyebrow: 'THE RECENT ROTATION',
      title: 'Lately, these are the familiar faces.',
      big: recentBig,
      unit: recentUnit,
      description: 'A quick read of the recent activity Steam makes public.',
      comment: makeBanter(id, 'recent', recent.map((game) => game.appid).join(':') + ':' + data.recentGamesPlayed),
      rows: recent.map((game, index) => ({
        label: game.name,
        value: '0' + (index + 1),
        detail: 'recently played',
      })),
      note: recentHoursValid
        ? 'Recent hours are a rolling 14-day figure, not a January–December total.'
        : 'The source returned a recent-game list but no believable 14-day hour total.',
    },
    {
      key: 'progress',
      eyebrow: 'THE PROGRESS JOURNAL',
      title: progress.first
        ? 'This is the starting line.'
        : progress.totalGain !== null && progress.totalGain > 0
          ? 'Your hours moved since last time.'
          : progress.changes.length
            ? 'A few games moved forward.'
            : 'No new hours recorded yet.',
      big: progress.first
        ? (progress.storageEnabled ? 'BASELINE SET' : 'NO LOCAL HISTORY')
        : progress.totalGain !== null
          ? '+' + formatHours(progress.totalGain) + ' h'
          : progress.changes.length
            ? formatNumber(progress.changes.length) + ' GAMES'
            : 'NO CHANGE',
      unit: progress.first
        ? 'THIS BROWSER CAN TRACK YOUR NEXT VISIT'
        : 'SINCE YOUR PREVIOUS LOOKUP',
      description: progress.first
        ? 'Next time you check this profile here, the wrap can compare the tracked game hours and spot new milestones.'
        : progress.totalGain !== null && progress.totalGain > 0
          ? 'The lifetime counter is up. Here is where the tracked hours went.'
          : 'No increase was visible in the games this public feed returned.',
      comment: makeBanter(id, 'progress', String(progress.totalGain) + ':' + progress.changes.map((game) => game.appid).join(':')),
      rows: progress.first ? [] : changedRows,
      note: progress.crossedMilestones.length
        ? 'New checkpoints: ' + progress.crossedMilestones.join(' · ')
        : progress.first
          ? 'Your history stays on this device. No account or cloud database.'
          : progress.storageEnabled
            ? 'Compared with the last snapshot saved in this browser.'
            : 'Browser storage is unavailable, so this visit could not be saved.',
    },
    {
      key: 'outro',
      eyebrow: 'END OF STORY',
      title: 'That is your Steam story. For now.',
      big: data.profile.personaName || 'PLAYER',
      unit: 'STEAM WRAPPED · 2026 EDITION',
      description: 'Come back after a few more sessions. The progress journal will have a new chapter.',
      comment: makeBanter(id, 'outro', String(data.totalHours) + ':' + data.profile.personaName),
      note: 'Public snapshot only: lifetime stats and recent activity, not exact 2026 calendar-year playtime.',
    },
  ];

  return slides;
}

function GameRows({ rows }: { rows: StoryRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="story-rows">
      {rows.map((row, index) => (
        <div className="story-row" key={row.label + ':' + index}>
          <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="row-name">{row.label}</span>
          <span className="row-detail">{row.detail || ''}</span>
          <strong className="row-value">{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

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
      setSlideDirection('forward');
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
    setSlideDirection('forward');
    setError('');
  }

  function goNext() {
    setSlideDirection('forward');
    setSlideIndex((current) => Math.min(current + 1, slides.length - 1));
  }

  function goBack() {
    setSlideDirection('back');
    setSlideIndex((current) => Math.max(current - 1, 0));
  }

  useEffect(() => {
    if (!data || showSearch) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        setSlideDirection('forward');
        setSlideIndex((current) => Math.min(current + 1, slides.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSlideDirection('back');
        setSlideIndex((current) => Math.max(current - 1, 0));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data, showSearch, slides.length]);

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" onClick={() => startNewProfile()}>
          STEAM WRAPPED <span>2026</span>
        </a>
        <div className="header-right">
          <span className="live-tag"><i /> PUBLIC PROFILE</span>
          {data && !showSearch && (
            <button className="text-button" type="button" onClick={startNewProfile}>Change profile</button>
          )}
        </div>
      </header>

      {showSearch ? (
        <section className="landing" id="top">
          <div className="landing-copy">
            <p className="eyebrow">YOUR YEAR IN GAMES, TOLD PROPERLY</p>
            <h1>Less dashboard.<br /><em>More story.</em></h1>
            <p className="landing-description">
              One slide at a time. Your main game, personal milestones, recent rotation and progress since your last visit.
            </p>
            <div className="landing-promises">
              <span>NO LOGIN</span>
              <span>NO API KEY</span>
              <span>JUST YOUR PROFILE LINK</span>
            </div>
          </div>

          <form className="profile-form" onSubmit={submit}>
            <label htmlFor="steam-profile">Steam profile</label>
            <input
              id="steam-profile"
              value={profileInput}
              onChange={(event) => setProfileInput(event.target.value)}
              placeholder="steamcommunity.com/id/yourname"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Reading profile…' : 'Build my wrap'}
              <span aria-hidden="true">↗</span>
            </button>
            {loading && <p className="form-status">Reading public Steam stats. This can take a moment.</p>}
            {error && <p className="error-message" role="alert">{error}</p>}
            <p className="form-footnote">Your Game Details must be public. No Steam sign-in is requested.</p>
          </form>
        </section>
      ) : data && progress && slide ? (
        <section className="story-player" aria-label="Steam Wrapped story">
          <div className="story-heading">
            <div className="story-person">
              {data.profile.avatar && <img src={data.profile.avatar} alt="" />}
              <div>
                <strong>{data.profile.personaName}</strong>
                <a href={data.profile.profileUrl} target="_blank" rel="noreferrer">Open Steam profile ↗</a>
              </div>
            </div>
            <div className="story-counter">
              <span>YOUR WRAP</span>
              <strong>{String(slideIndex + 1).padStart(2, '0')} <i>/</i> {String(slides.length).padStart(2, '0')}</strong>
            </div>
          </div>

          <div className="story-progress" aria-label={'Slide ' + (slideIndex + 1) + ' of ' + slides.length}>
            <span style={{ width: ((slideIndex + 1) / slides.length * 100) + '%' }} />
          </div>

          <article className={'story-slide ' + (slideDirection === 'back' ? 'is-back' : 'is-forward')} key={slide.key + '-' + slideIndex}>
            <div className="slide-glow" />
            <div className="slide-content">
              <p className="eyebrow">{slide.eyebrow}</p>
              <h1>{slide.title}</h1>
              <div className="slide-stat-block">
                <div className="slide-stat">{slide.big}</div>
                <div className="slide-unit">{slide.unit}</div>
              </div>
              <p className="slide-description">{slide.description}</p>
              <GameRows rows={slide.rows || []} />
              <p className="slide-comment">{slide.comment}</p>
              {slide.note && <p className="slide-note">{slide.note}</p>}
            </div>
            <div className="slide-side-mark" aria-hidden="true">
              <span>SW</span>
              <i />
              <small>2026</small>
            </div>
          </article>

          <div className="story-controls">
            <button className="back-button" type="button" onClick={goBack} disabled={slideIndex === 0}>
              <span aria-hidden="true">←</span> Back
            </button>
            <div className="story-dots" aria-label="Story slides">
              {slides.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={index === slideIndex ? 'story-dot active' : 'story-dot'}
                  onClick={() => { setSlideDirection(index < slideIndex ? 'back' : 'forward'); setSlideIndex(index); }}
                  aria-label={'Go to slide ' + (index + 1)}
                  aria-current={index === slideIndex ? 'step' : undefined}
                />
              ))}
            </div>
            {slideIndex === slides.length - 1 ? (
              <button className="next-button" type="button" onClick={() => { setSlideDirection('back'); setSlideIndex(0); }}>
                Replay wrap <span aria-hidden="true">↻</span>
              </button>
            ) : (
              <button className="next-button" type="button" onClick={goNext}>
                Next slide <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </section>
      ) : null}

    </main>
  );
}