import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Game, WrappedData } from './lib/types';
import { date, hours, number } from './lib/format';

const dataUrl = `${import.meta.env.BASE_URL}data/wrapped.json`;
type LoadState = 'loading' | 'ready' | 'error';

function Icon({ name }: { name: 'arrow' | 'external' | 'download' | 'upload' | 'steam' | 'spark' | 'clock' | 'trophy' | 'grid' | 'share' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<typeof name, ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    external: <><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></>,
    steam: <><circle cx="12" cy="12" r="9"/><circle cx="16.5" cy="7.5" r="2.2"/><circle cx="9" cy="14" r="3"/><path d="m11.4 12.8 3.4-3.6"/><path d="m6.3 13.1-3-1.3"/></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function StatTile({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: 'clock' | 'grid' | 'trophy' | 'spark' }) {
  return <div className="stat-tile"><div className="stat-top"><span>{label}</span><Icon name={icon}/></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
}

function GameRow({ game, index, maxHours, year }: { game: Game; index: number; maxHours: number; year: number }) {
  const percent = maxHours > 0 ? Math.max(2, (game.playtimeForeverHours / maxHours) * 100) : 2;
  return <div className="game-row">
    <div className="game-rank">{String(index + 1).padStart(2, '0')}</div>
    <div className="game-image">{game.iconUrl ? <img src={game.iconUrl} alt="" loading="lazy"/> : <span>{game.name.slice(0, 1).toUpperCase()}</span>}</div>
    <div className="game-main">
      <div className="game-title-line"><strong>{game.name}</strong><span>{hours(game.playtimeForeverHours)} h</span></div>
      <div className="game-bar"><span style={{ width: `${percent}%` }}/></div>
      <div className="game-meta"><span>{hours(game.trackedYearHours)} h tracked in {year}</span>{game.achievements && <span>{game.achievements.unlocked}/{game.achievements.total} achievements</span>}{!game.achievements && game.statsAvailable && <span>Player stats available</span>}</div>
    </div>
  </div>;
}

export default function App() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'hours' | 'name' | 'tracked'>('hours');
  const [notice, setNotice] = useState('');
  const [activeGame, setActiveGame] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(dataUrl, { cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error('Data file unavailable'); return response.json() as Promise<WrappedData>; })
      .then((payload) => { if (alive) { setData(payload); setState('ready'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, []);

  const games = useMemo(() => !data ? [] : [...data.games]
    .filter((game) => game.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'tracked' ? b.trackedYearHours - a.trackedYearHours : b.playtimeForeverHours - a.playtimeForeverHours), [data, query, sort]);
  const topGame = data?.games.reduce<Game | null>((best, game) => !best || game.playtimeForeverHours > best.playtimeForeverHours ? game : best, null) ?? null;
  const maxHours = data?.games.reduce((max, game) => Math.max(max, game.playtimeForeverHours), 0) ?? 0;
  const selectedGame = data?.games.find((game) => game.appId === activeGame) ?? null;

  async function share() {
    const title = `${data?.profile.name ?? 'My'} Steam Wrapped ${data?.year ?? 2026}`;
    const text = `My Steam Wrapped: ${number(data?.summary.totalGames ?? 0)} games and ${hours(data?.summary.lifetimeHours ?? 0)} lifetime hours.`;
    try {
      if (navigator.share) await navigator.share({ title, text, url: window.location.href });
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setNotice('Share text copied to clipboard.'); }
    } catch (error) { if (error instanceof Error && error.name !== 'AbortError') setNotice('Could not open sharing on this device.'); }
  }

  function downloadData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `steam-wrapped-${data.year}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as WrappedData;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.games) || !parsed.summary) throw new Error('Invalid Wrapped data file.');
      setData(parsed); setState('ready'); setNotice('Personal Wrapped data loaded in this browser.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read that JSON file.'); }
  }

  if (state === 'loading') return <div className="loading-screen"><div className="loader-mark">SW</div><p>Putting your year together…</p></div>;
  if (state === 'error' || !data) return <main className="setup-error"><span className="eyebrow">STEAM WRAPPED / 2026</span><h1>Your year is waiting.</h1><p>The data file could not be loaded. Run the local collector to create <code>public/data/wrapped.json</code>, or import an existing Wrapped JSON file.</p><button className="button button-dark" onClick={() => fileRef.current?.click()}><Icon name="upload"/> Import Wrapped JSON</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importData(event.target.files?.[0])}/></main>;

  const coverageStart = date(data.tracking.coverageStart);
  const demo = data.source === 'demo';

  return <main className="page-shell">
    <header className="site-header">
      <a className="wordmark" href="#top"><span className="wordmark-icon">S</span> STEAM WRAPPED <span className="wordmark-year">/{data.year}</span></a>
      <div className="header-actions"><button className="text-button" onClick={() => fileRef.current?.click()}><Icon name="upload"/> Import data</button><button className="icon-button" aria-label="Download data" title="Download data" onClick={downloadData}><Icon name="download"/></button><button className="button button-dark button-small" onClick={() => void share()}><Icon name="share"/> Share</button></div>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importData(event.target.files?.[0])}/>
    </header>

    <section id="top" className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot"/> YOUR YEAR IN GAMES</span><h1>Every game.<br/><em>One year.</em></h1><p className="hero-lede">A look back at the worlds you got lost in, the hours that disappeared, and the games that kept you coming back.</p>
        <div className="profile-line">{data.profile.avatar && <img className="avatar" src={data.profile.avatar} alt=""/>}<span><strong>{data.profile.name}</strong><small>Steam player · {data.year}</small></span><a className="profile-link" href={data.profile.url} target="_blank" rel="noreferrer" aria-label="Open Steam profile"><Icon name="external"/></a></div>
      </div>
      <div className="hero-art" aria-label="Abstract game-library artwork"><div className="hero-art-orbit orbit-one"/><div className="hero-art-orbit orbit-two"/><div className="hero-art-core"><span>THE<br/>PLAY<br/>LIST</span><small>{String(data.year).slice(2)}</small></div><div className="art-index art-index-top">A YEAR<br/>IN REVIEW</div><div className="art-index art-index-bottom">VOL. 01&nbsp; / &nbsp;{String(data.year)}</div><div className="art-cross cross-one"/><div className="art-cross cross-two"/></div>
    </section>

    {demo && <div className="demo-banner"><Icon name="spark"/> Preview data is being shown. Run the collector and publish your own JSON to replace it.</div>}
    <section className="intro-strip"><span className="section-kicker">THE BIG PICTURE</span><p>Not just what you played.<br/><strong>What your year looked like.</strong></p></section>
    <section className="stats-grid" aria-label="Year overview">
      <StatTile label="Games in your library" value={number(data.summary.totalGames)} detail="Detected on Steam" icon="grid"/>
      <StatTile label="Lifetime playtime" value={`${hours(data.summary.lifetimeHours)}h`} detail="Across detected games" icon="clock"/>
      <StatTile label={`Tracked in ${data.year}`} value={`${hours(data.summary.trackedYearHours)}h`} detail={data.tracking.isFullYear ? 'Full-year snapshot coverage' : `Tracked since ${coverageStart}`} icon="spark"/>
      <StatTile label="Achievements unlocked" value={number(data.summary.achievementUnlocked)} detail={`${number(data.summary.achievementTotal)} available across scanned games`} icon="trophy"/>
    </section>

    <section className="feature-section">
      <div className="section-heading"><div><span className="section-kicker">YOUR NO. 01</span><h2>The one you kept coming back to.</h2></div><span className="heading-side">MOST PLAYED<br/>BY LIFETIME HOURS</span></div>
      {topGame ? <div className="top-game-card"><div className="top-game-image">{topGame.iconUrl ? <img src={topGame.iconUrl} alt=""/> : <span>{topGame.name.slice(0, 1)}</span>}<span className="top-game-index">01 / MOST PLAYED</span></div><div className="top-game-info"><span className="section-kicker">YOUR TOP GAME</span><h3>{topGame.name}</h3><p>That familiar icon. That one-more-round feeling. Your most-played game across the Steam library.</p><div className="top-game-metrics"><div><strong>{hours(topGame.playtimeForeverHours)}h</strong><span>Lifetime playtime</span></div><div><strong>{hours(topGame.trackedYearHours)}h</strong><span>Tracked in {data.year}</span></div></div><button className="inline-link" onClick={() => setActiveGame(topGame.appId)}>View game stats <Icon name="arrow"/></button></div></div> : <p className="empty-state">No games were returned by Steam for this account.</p>}
    </section>

    <section className="library-section" id="library">
      <div className="section-heading"><div><span className="section-kicker">THE FULL LINEUP</span><h2>Your library, in numbers.</h2></div><span className="heading-side">{number(data.games.length)} GAMES<br/>DETECTED</span></div>
      <div className="library-tools"><label className="search-box"><span className="search-glyph">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game…" aria-label="Search games"/></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort games"><option value="hours">Most played</option><option value="tracked">Most tracked in {data.year}</option><option value="name">Name A–Z</option></select></div>
      <div className="game-list">{games.slice(0, 100).map((game, index) => <button className="game-row-button" key={game.appId} onClick={() => setActiveGame(game.appId)}><GameRow game={game} index={index} maxHours={maxHours} year={data.year}/></button>)}</div>
      {games.length > 100 && <p className="list-note">Showing 100 of {number(games.length)} games. Search to find the rest.</p>}
      {games.length === 0 && <p className="empty-state">No games match “{query}”.</p>}
    </section>

    <section className="footnote-section"><div className="footnote-mark">*</div><div><span className="section-kicker">A NOTE ON THE NUMBERS</span><p>Steam reports lifetime playtime. The “tracked in {data.year}” figure is calculated from local snapshots, starting {coverageStart}. It is not a full-year total unless tracking began on 1 January. Game-specific kills, deaths, match ratings and similar stats are only available when a game exposes them through Steam or a supported game adapter.</p><small>Last collected {date(data.generatedAt)} · Data is published publicly with this page.</small></div></section>
    <footer className="site-footer"><a className="wordmark" href="#top"><span className="wordmark-icon">S</span> STEAM WRAPPED <span className="wordmark-year">/{data.year}</span></a><span>MADE OF THE HOURS YOU PLAYED.</span><a href="https://steamcommunity.com/dev" target="_blank" rel="noreferrer">STEAM WEB API <Icon name="external"/></a></footer>

    {selectedGame && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveGame(null); }}><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setActiveGame(null)} aria-label="Close">×</button><span className="section-kicker">GAME DETAILS / {selectedGame.appId}</span><h2 id="modal-title">{selectedGame.name}</h2><div className="modal-stats"><div><strong>{hours(selectedGame.playtimeForeverHours)}h</strong><span>Lifetime hours</span></div><div><strong>{hours(selectedGame.trackedYearHours)}h</strong><span>Tracked in {data.year}</span></div><div><strong>{selectedGame.achievements ? `${selectedGame.achievements.percent}%` : '—'}</strong><span>Achievement completion</span></div></div>{selectedGame.achievements && <p className="modal-note">{selectedGame.achievements.unlocked} of {selectedGame.achievements.total} achievements unlocked.</p>}{selectedGame.stats?.length ? <div className="raw-stats"><span className="section-kicker">STEAM PLAYER STATS</span>{selectedGame.stats.slice(0, 12).map((stat) => <div key={stat.name}><span>{stat.displayName || stat.name}</span><strong>{typeof stat.value === 'number' ? number(stat.value) : stat.value}</strong></div>)}</div> : <p className="modal-note">No detailed player stats were returned for this game. It may not expose player statistics through Steam's public API.</p>}<a className="inline-link" href={`https://store.steampowered.com/app/${selectedGame.appId}`} target="_blank" rel="noreferrer">Open Steam store page <Icon name="external"/></a></section></div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </main>;
}
