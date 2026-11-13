import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AchievementEvent, Game, WrappedData } from './lib/types';

const DATA_URL = import.meta.env.BASE_URL + 'data/wrapped.json';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
function fmtHours(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}
function duration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return '—';
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? h + 'h ' + m + 'm' : m + 'm';
}
function dayMonth(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function monthName(value: string) {
  const d = new Date(value + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'long' });
}

function Icon({ name }: { name: 'arrow' | 'external' | 'download' | 'upload' | 'steam' | 'spark' | 'clock' | 'trophy' | 'grid' | 'share' | 'calendar' | 'activity' | 'chevron' }) {
  const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
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
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  };
  return <svg {...base} aria-hidden="true">{paths[name]}</svg>;
}

function StatTile({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: 'clock' | 'grid' | 'trophy' | 'activity' }) {
  return <article className="stat-tile">
    <div className="stat-top"><span>{label}</span><Icon name={icon}/></div>
    <div className="stat-value">{value}</div>
    <div className="stat-detail">{detail}</div>
  </article>;
}

function GameRow({ game, index, maxHours, year, onClick }: { game: Game; index: number; maxHours: number; year: number; onClick: () => void }) {
  const hasTime = game.yearHoursExact !== null;
  const percent = hasTime && maxHours > 0 ? Math.max(2, (game.yearHoursExact! / maxHours) * 100) : 0;
  return <button className="game-row-button" onClick={onClick}>
    <div className="game-row">
      <div className="game-rank">{String(index + 1).padStart(2, '0')}</div>
      <div className="game-image">{game.iconUrl ? <img src={game.iconUrl} alt="" loading="lazy"/> : <span>{game.name.slice(0, 1).toUpperCase()}</span>}</div>
      <div className="game-main">
        <div className="game-title-line"><strong>{game.name}</strong><span>{hasTime ? fmtHours(game.yearHoursExact!) + ' h' : 'No session log'}</span></div>
        <div className="game-bar"><span style={{ width: percent + '%' }}/></div>
        <div className="game-meta">
          <span>{fmtHours(game.playtimeForeverHours)} h lifetime</span>
          {game.yearSessions > 0 && <span>{fmt(game.yearSessions)} sessions in {year}</span>}
          {game.achievements2026 > 0 && <span>{game.achievements2026} unlocks in {year}</span>}
        </div>
      </div>
      <span className="game-chevron"><Icon name="arrow"/></span>
    </div>
  </button>;
}

function buildHeatmap(data: WrappedData) {
  const dayValues = new Map<string, { minutes: number; achievements: number }>();
  for (const item of data.activity.daily) dayValues.set(item.date, { minutes: item.minutes, achievements: 0 });
  for (const event of data.activity.achievements) {
    const day = event.date.slice(0, 10);
    const current = dayValues.get(day) ?? { minutes: 0, achievements: 0 };
    current.achievements += 1;
    dayValues.set(day, current);
  }
  const start = new Date(data.yearToDate.start + 'T12:00:00');
  const end = new Date(data.yearToDate.end + 'T12:00:00');
  const offset = start.getDay();
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - offset);
  const weeks: { key: string; days: { date: string; level: number; outside: boolean; label: string }[] }[] = [];
  while (cursor <= end) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
      const item = dayValues.get(key);
      const score = (item?.minutes ?? 0) / 60 + (item?.achievements ?? 0) * 0.35;
      const level = score <= 0 ? 0 : score < 1 ? 1 : score < 3 ? 2 : score < 6 ? 3 : 4;
      days.push({ date: key, level, outside: cursor < start || cursor > end, label: cursor.getDate() + ' ' + MONTHS[cursor.getMonth()] });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ key: days[0].date, days });
  }
  return weeks;
}

export default function App() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'year' | 'lifetime' | 'name'>('year');
  const [notice, setNotice] = useState('');
  const [activeGame, setActiveGame] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(DATA_URL, { cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error('Wrapped data file unavailable.'); return response.json() as Promise<WrappedData>; })
      .then((payload) => { if (alive) setData(payload); })
      .catch((error: unknown) => { if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load Wrapped data.'); });
    return () => { alive = false; };
  }, []);

  const games = useMemo(() => !data ? [] : [...data.games]
    .filter((game) => game.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name)
      : sort === 'lifetime'
        ? b.playtimeForeverHours - a.playtimeForeverHours
        : (b.yearHoursExact ?? -1) - (a.yearHoursExact ?? -1) || b.achievements2026 - a.achievements2026),
  [data, query, sort]);

  const heatmap = useMemo(() => data ? buildHeatmap(data) : [], [data]);
  const maxMonth = data?.activity.monthly.reduce((max, item) => Math.max(max, data.summary.yearHoursExact !== null ? item.hours : item.achievements), 0) ?? 0;
  const hasSessionHistory = data?.summary.yearHoursExact !== null && data?.summary.yearHoursExact !== undefined;
  const topSessionGame = data?.games.find((game) => game.appId === data.topSessionGameAppId) ?? null;
  const firstAchievement = data?.activity.achievements[0] ?? null;
  const lastAchievement = data?.activity.achievements[data.activity.achievements.length - 1] ?? null;
  const selectedGame = data?.games.find((game) => game.appId === activeGame) ?? null;
  const cs2 = data?.games.find((game) => /counter.?strike 2/i.test(game.name)) ?? null;
  const warThunder = data?.games.find((game) => /war thunder/i.test(game.name)) ?? null;

  async function share() {
    if (!data) return;
    const title = data.profile.name + ' — Steam Wrapped ' + data.year;
    const text = hasSessionHistory
      ? data.year + ' in games: ' + fmtHours(data.summary.yearHoursExact!) + ' measured hours, ' + fmt(data.summary.yearSessions) + ' sessions and ' + fmt(data.summary.achievementUnlocked2026) + ' achievement unlocks.'
      : data.year + ' in games: ' + fmt(data.summary.achievementUnlocked2026) + ' verified achievement unlocks across ' + fmt(data.summary.totalGames) + ' Steam games.';
    try {
      if (navigator.share) await navigator.share({ title, text, url: window.location.href });
      else { await navigator.clipboard.writeText(text + ' ' + window.location.href); setNotice('Wrapped link copied to clipboard.'); }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') setNotice('Could not open sharing on this device.');
    }
  }

  function downloadData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'steam-wrapped-' + data.year + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as WrappedData;
      if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.games) || !parsed.summary) throw new Error('This file is not a supported Steam Wrapped data export.');
      setData(parsed);
      setNotice('Wrapped data loaded in this browser.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read that JSON file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!data) return <div className="loading-screen"><div className="loader-mark">S</div><p>{loadError || 'Reconstructing your year…'}</p></div>;

  const setup = data.source === 'setup';

  return <main className="page-shell">
    <header className="site-header">
      <a className="wordmark" href="#top"><span className="wordmark-icon">S</span> STEAM WRAPPED <span className="wordmark-year">/{data.year}</span></a>
      <div className="header-actions">
        <button className="text-button" onClick={() => fileRef.current?.click()}><Icon name="upload"/> Import</button>
        <button className="icon-button" aria-label="Download Wrapped JSON" title="Download JSON" onClick={downloadData}><Icon name="download"/></button>
        <button className="button button-dark button-small" onClick={() => void share()}><Icon name="share"/> Share</button>
      </div>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importData(event.target.files?.[0])}/>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow"><span className="eyebrow-dot"/> YOUR GAMING YEAR / {data.year}</span>
        <h1>{setup ? <>Your year.<br/><em>Uncovered.</em></> : <>A year of<br/><em>main quests.</em></>}</h1>
        <p className="hero-lede">{setup
          ? 'Your 2026 recap is ready to be built from your own Steam history. Connect the local collector to uncover the games, sessions and achievements that shaped your year.'
          : 'January through ' + monthName(data.yearToDate.end).toLowerCase() + ': the games you returned to, the sessions that stretched late, and the achievements you unlocked along the way.'}</p>
        <div className="hero-period"><Icon name="calendar"/><strong>JANUARY — {MONTHS[(data.yearToDate.endMonth || 11) - 1].toUpperCase()} {data.year}</strong><span>YEAR TO DATE</span></div>
        {!setup && <div className="profile-line">
          {data.profile.avatar && <img className="avatar" src={data.profile.avatar} alt=""/>}
          <span><strong>{data.profile.name}</strong><small>Steam player · {data.year}</small></span>
          <a className="profile-link" href={data.profile.url} target="_blank" rel="noreferrer" aria-label="Open Steam profile"><Icon name="external"/></a>
        </div>}
      </div>
      <div className="hero-art" aria-label="Abstract 2026 gaming year artwork">
        <div className="hero-art-grid"/>
        <div className="hero-art-orbit orbit-one"/><div className="hero-art-orbit orbit-two"/>
        <div className="hero-art-core"><span>{data.year}</span><small>IN PLAY</small></div>
        <div className="art-index art-index-top">A PERSONAL<br/>YEAR IN REVIEW</div>
        <div className="art-index art-index-bottom">THE GAMES. THE HOURS. THE MOMENTS.</div>
        <div className="art-cross cross-one"/><div className="art-cross cross-two"/>
      </div>
    </section>

    {setup ? <section className="setup-panel">
      <div className="setup-number">01</div>
      <div className="setup-copy"><span className="section-kicker">CONNECT YOUR HISTORY</span><h2>Let's find your 2026.</h2>
        <p>The website is deliberately showing no invented player stats. Run the collector on the PC where you use Steam. It will look for your local session logs and timestamped achievement history, then create the real Wrapped data.</p>
        <pre><code>Copy-Item .env.example .env{'\n'}notepad .env{'\n'}python scripts/collect.py</code></pre>
        <p className="setup-footnote">The collector scans your Steam library, reads local Steam activity logs, and retrieves achievement unlock timestamps. Keep your API key inside the local .env file.</p>
        <a className="button button-dark" href="https://github.com/zerryH/steam-wrapped-2026#1-set-up-the-steam-collector-windows" target="_blank" rel="noreferrer">Open setup instructions <Icon name="arrow"/></a>
      </div>
    </section> : <>
      <section className="section-intro">
        <span className="section-kicker">THE BIG PICTURE</span>
        <p>This is your year so far.<br/><strong>Measured where possible. Never made up.</strong></p>
      </section>

      <section className="stats-grid" aria-label="2026 year-to-date statistics">
        <StatTile label="2026 playtime" value={hasSessionHistory ? fmtHours(data.summary.yearHoursExact!) + 'h' : 'Not measured'} detail={hasSessionHistory ? 'Paired local Steam sessions' : 'Local session logs not found'} icon="clock"/>
        <StatTile label="Sessions recorded" value={fmt(data.summary.yearSessions)} detail="Steam app start / exit pairs" icon="activity"/>
        <StatTile label="Achievements in 2026" value={fmt(data.summary.achievementUnlocked2026)} detail={fmt(data.summary.achievementActiveDays) + ' achievement days'} icon="trophy"/>
        <StatTile label="Games with 2026 activity" value={fmt(data.summary.activeGames2026)} detail={'Out of ' + fmt(data.summary.totalGames) + ' detected games'} icon="grid"/>
      </section>

      <section className="feature-section">
        <div className="section-heading"><div><span className="section-kicker">YOUR 2026 REPLAY</span><h2>The shape of your year.</h2></div><span className="heading-side">MONTH BY MONTH<br/>JAN — {MONTHS[(data.yearToDate.endMonth || 11) - 1].toUpperCase()}</span></div>
        <div className="timeline-card">
          <div className="timeline-header"><div><strong>{hasSessionHistory ? fmtHours(data.summary.yearHoursExact!) + ' hours measured' : 'Activity timeline'}</strong><span>{hasSessionHistory ? 'Time from the Steam client logs we could recover' : 'Achievement unlocks are shown until session logs are imported'}</span></div><div className="timeline-legend"><i className="legend-play"/>{hasSessionHistory ? 'Playtime' : 'Achievements'}</div></div>
          <div className="month-chart">
            {data.activity.monthly.map((month) => {
              const amount = hasSessionHistory ? month.hours : month.achievements;
              const height = amount > 0 ? Math.max(4, amount / Math.max(1, maxMonth) * 100) : 2;
              return <div className="month-column" key={month.month}>
                <div className="month-value">{hasSessionHistory ? (month.hours > 0 ? fmtHours(month.hours) + 'h' : '') : (month.achievements > 0 ? month.achievements : '')}</div>
                <div className="month-bar-track"><div className={'month-bar ' + (amount > 0 ? 'has-value' : '')} style={{ height: height + '%' }}/></div>
                <span>{MONTHS[month.month - 1]}</span>
              </div>;
            })}
          </div>
          <div className="timeline-footnote">{hasSessionHistory
            ? 'Bars show the duration of paired Steam sessions in each month. ' + (data.summary.busiestMonth ? data.summary.busiestMonth + ' was your biggest month in the recovered logs. ' : '') + (data.yearToDate.endMonth < 12 ? MONTHS[data.yearToDate.endMonth - 1] + ' is month-to-date.' : 'The full calendar year is included.')
            : 'This is an activity chronology, not an hour estimate. Unlocks are timestamped by Steam; missing achievements or logs can leave gaps.'}</div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading"><div><span className="section-kicker">YOUR ACTIVITY MAP</span><h2>The days you showed up.</h2></div><span className="heading-side">DAILY SIGNALS<br/>SESSION + ACHIEVEMENT</span></div>
        <div className="heatmap-card">
          <div className="heatmap-months">{MONTHS.slice(0, data.yearToDate.endMonth).map((month) => <span key={month}>{month}</span>)}</div>
          <div className="heatmap-body">
            <div className="heatmap-weekdays"><span>Sun</span><span>Tue</span><span>Thu</span><span>Sat</span></div>
            <div className="heatmap-grid">
              {heatmap.map((week) => <div className="heatmap-week" key={week.key}>
                {week.days.map((day) => <span key={day.date} title={day.outside ? '' : day.label} className={'heat-cell level-' + day.level + (day.outside ? ' outside' : '')}/>)}
              </div>)}
            </div>
          </div>
          <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={'heat-cell level-' + level}/>)}<span>More</span><small>Session minutes + 2026 achievement unlocks</small></div>
        </div>
        <div className="insight-grid">
          <article className="insight-card"><span className="section-kicker">MOST ACTIVE WEEKDAY</span><strong>{hasSessionHistory ? (data.summary.mostPlayedWeekday ?? '—') : 'Not enough session data'}</strong><p>{hasSessionHistory ? 'Based on total logged hours by local weekday.' : 'Import complete Steam session logs to calculate this.'}</p></article>
          <article className="insight-card"><span className="section-kicker">AVERAGE SESSION</span><strong>{hasSessionHistory ? duration((data.summary.averageSessionMinutes ?? 0) * 60) : '—'}</strong><p>{hasSessionHistory ? 'Average length of paired local sessions.' : 'Calculated only from complete start / exit pairs.'}</p></article>
          <article className="insight-card"><span className="section-kicker">LONGEST SESSION</span><strong>{hasSessionHistory ? duration(data.summary.longestSessionSeconds) : '—'}</strong><p>{hasSessionHistory ? 'Longest single session found in your logs.' : 'No verified session duration available.'}</p></article>
        </div>
        {hasSessionHistory && <div className="time-perspective">
          <span className="section-kicker">TIME, PUT INTO PERSPECTIVE</span>
          <div className="perspective-grid">
            <article><strong>{data.summary.continuousDaysEquivalent.toFixed(1)} days</strong><span>Non-stop, around the clock</span><p>All your recovered 2026 session hours, played back continuously.</p></article>
            <article><strong>{data.summary.eightHourDaysEquivalent.toFixed(1)} days</strong><span>Eight-hour days</span><p>The same time expressed as full eight-hour days.</p></article>
            <article><strong>{data.summary.averageHoursPerActiveDay?.toFixed(1) ?? '—'} h</strong><span>Per active day</span><p>Your average measured playtime on days with a recorded session.</p></article>
          </div>
        </div>}
      </section>

      <section className="feature-section">
        <div className="section-heading"><div><span className="section-kicker">THE GAME THAT LED THE YEAR</span><h2>Your most-played in 2026.</h2></div><span className="heading-side">ONLY FROM<br/>RECOVERED SESSIONS</span></div>
        {topSessionGame ? <div className="top-game-card">
          <div className="top-game-image">{topSessionGame.iconUrl ? <img src={topSessionGame.iconUrl} alt=""/> : <span>{topSessionGame.name.slice(0, 1)}</span>}<span className="top-game-index">NO. 01 / {data.year}</span></div>
          <div className="top-game-info"><span className="section-kicker">MOST HOURS RECORDED</span><h3>{topSessionGame.name}</h3><p>The game that claimed the biggest share of the session time recovered from your Steam logs.</p>
            <div className="top-game-metrics"><div><strong>{fmtHours(topSessionGame.yearHoursExact ?? 0)}h</strong><span>Measured hours</span></div><div><strong>{fmt(topSessionGame.yearSessions)}</strong><span>Sessions</span></div><div><strong>{fmt(topSessionGame.yearActiveDays)}</strong><span>Active days</span></div></div>
            <button className="inline-link" onClick={() => setActiveGame(topSessionGame.appId)}>View game stats <Icon name="arrow"/></button>
          </div>
        </div> : <div className="no-history-card"><span className="section-kicker">WAITING FOR LOCAL SESSION LOGS</span><h3>Your top game is still unknown.</h3><p>Steam's lifetime counter cannot tell us which hours happened in 2026. Run the collector on your Steam PC to scan the local start/exit logs and reveal your true yearly ranking.</p></div>}
      </section>

      <section className="feature-section achievements-section">
        <div className="section-heading"><div><span className="section-kicker">THE MILESTONES</span><h2>Every unlock tells a story.</h2></div><span className="heading-side">{fmt(data.summary.achievementUnlocked2026)} UNLOCKS<br/>IN {data.year}</span></div>
        <div className="achievement-summary">
          <article><span className="section-kicker">FIRST UNLOCK OF THE YEAR</span><strong>{firstAchievement?.displayName ?? 'No timestamped unlocks found'}</strong><small>{firstAchievement ? firstAchievement.gameName + ' · ' + dayMonth(firstAchievement.date) : 'Steam achievement timestamps are still being scanned.'}</small></article>
          <article><span className="section-kicker">MOST RECENT UNLOCK</span><strong>{lastAchievement?.displayName ?? '—'}</strong><small>{lastAchievement ? lastAchievement.gameName + ' · ' + dayMonth(lastAchievement.date) : 'No 2026 unlock is available yet.'}</small></article>
        </div>
        {data.activity.achievements.length > 0 ? <div className="achievement-list">
          {[...data.activity.achievements].reverse().slice(0, 12).map((event: AchievementEvent, index) => <div className="achievement-row" key={event.appId + '-' + event.unlockTime + '-' + index}>
            <div className="achievement-icon"><Icon name="trophy"/></div>
            <div className="achievement-copy"><strong>{event.displayName}</strong><span>{event.gameName}</span></div>
            <time>{dayMonth(event.date)}</time>
          </div>)}
          {data.activity.achievements.length > 12 && <p className="list-note">Showing the latest 12 of {fmt(data.activity.achievements.length)} dated unlocks.</p>}
        </div> : <div className="no-history-card small"><p>No unlock timestamps from 2026 were returned for the games scanned. This does not mean you played zero hours; many games do not use Steam achievements.</p></div>}
      </section>

      <section className="feature-section">
        <div className="section-heading"><div><span className="section-kicker">THE FULL LINEUP</span><h2>All your games, in context.</h2></div><span className="heading-side">{fmt(data.games.length)} GAMES<br/>DETECTED</span></div>
        <div className="library-tools"><label className="search-box"><span className="search-glyph">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game…" aria-label="Search games"/></label>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort games"><option value="year">2026 activity</option><option value="lifetime">Lifetime hours</option><option value="name">Name A–Z</option></select>
        </div>
        <div className="game-list">{games.slice(0, 150).map((game, index) => <GameRow key={game.appId} game={game} index={index} maxHours={Math.max(1, ...data.games.map((item) => item.yearHoursExact ?? 0))} year={data.year} onClick={() => setActiveGame(game.appId)}/>)}</div>
        {games.length > 150 && <p className="list-note">Showing 150 of {fmt(games.length)} games. Search to find the rest.</p>}
        {games.length === 0 && <p className="empty-state">No games match “{query}”.</p>}
      </section>

      <section className="game-tracker-grid">
        {cs2 && <article className="tracker-card">
          <span className="section-kicker">COUNTER-STRIKE 2</span><h3>Beyond playtime.</h3>
          <p>Steam returned {cs2.stats?.length ?? 0} game-specific lifetime counters for CS2. These are lifetime values, not 2026-only match stats.</p>
          {cs2.stats && cs2.stats.length > 0 && <div className="tracker-mini-stats">{cs2.stats.filter((stat) => /kill|death|win|headshot|time_played/i.test(stat.name)).slice(0, 4).map((stat) => <div key={stat.name}><span>{stat.displayName ?? stat.name}</span><strong>{typeof stat.value === 'number' ? fmt(stat.value) : stat.value}</strong></div>)}</div>}
          <a className="tracker-link" href="https://leetify.com/" target="_blank" rel="noreferrer">Open Leetify match analytics <Icon name="external"/></a>
        </article>}
        {warThunder && <article className="tracker-card">
          <span className="section-kicker">WAR THUNDER</span><h3>Vehicle history.</h3>
          <p>Steam can report the game's playtime, but detailed aircraft, ground vehicle, win-rate and K/D history needs a War Thunder tracker record.</p>
          {data.thunderSkill ? <a className="tracker-link" href={data.thunderSkill.yearCompareUrl} target="_blank" rel="noreferrer">Open your 2026 ThunderSkill comparison <Icon name="external"/></a> : <p className="tracker-tip">Set THUNDERSKILL_NICKNAME in your local .env to add your public tracker link.</p>}
        </article>}
      </section>

      <section className="footnote-section">
        <div className="footnote-mark">*</div><div><span className="section-kicker">HOW TO READ THIS RECAP</span>
          <p><strong>Measured hours</strong> are summed from local Steam app start/exit records that could be paired. A missing, rotated, deleted or reinstalled Steam log can leave gaps. <strong>Achievements</strong> use Steam's individual unlock timestamps and are a separate activity signal, not a playtime estimate. Steam's lifetime counter is shown only as lifetime context.</p>
          <small>{fmt(data.history.sessionLogFiles.length)} Steam log files detected · {fmt(data.history.achievementGamesScanned)} of {fmt(data.games.length)} games scanned for achievement history</small>
        </div>
      </section>
    </>}

    <footer className="site-footer"><a className="wordmark" href="#top"><span className="wordmark-icon">S</span> STEAM WRAPPED <span className="wordmark-year">/{data.year}</span></a><span>YOUR YEAR. YOUR DATA. YOUR STORY.</span><a href="https://github.com/zerryH/steam-wrapped-2026" target="_blank" rel="noreferrer">OPEN SOURCE <Icon name="external"/></a></footer>

    {selectedGame && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveGame(null); }}>
      <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" onClick={() => setActiveGame(null)} aria-label="Close">×</button>
        <span className="section-kicker">GAME DETAILS / {selectedGame.appId}</span><h2 id="modal-title">{selectedGame.name}</h2>
        <div className="modal-stats">
          <div><strong>{selectedGame.yearHoursExact === null ? '—' : fmtHours(selectedGame.yearHoursExact) + 'h'}</strong><span>Measured in {data.year}</span></div>
          <div><strong>{fmt(selectedGame.yearSessions)}</strong><span>Recorded sessions</span></div>
          <div><strong>{fmtHours(selectedGame.playtimeForeverHours)}h</strong><span>Lifetime playtime</span></div>
        </div>
        <div className="modal-extra">
          <div><span>Active days in {data.year}</span><strong>{fmt(selectedGame.yearActiveDays)}</strong></div>
          <div><span>Achievement unlocks in {data.year}</span><strong>{fmt(selectedGame.achievements2026)}</strong></div>
          <div><span>Longest session</span><strong>{duration(selectedGame.longestSessionSeconds)}</strong></div>
        </div>
        {selectedGame.achievements && <p className="modal-note">{fmt(selectedGame.achievements.unlocked)} of {fmt(selectedGame.achievements.total)} Steam achievements unlocked ({selectedGame.achievements.percent}% overall).</p>}
        {selectedGame.stats?.length ? <div className="raw-stats"><span className="section-kicker">STEAM PLAYER COUNTERS · LIFETIME</span>{selectedGame.stats.slice(0, 16).map((stat) => <div key={stat.name}><span>{stat.displayName || stat.name}</span><strong>{typeof stat.value === 'number' ? fmt(stat.value) : stat.value}</strong></div>)}</div> : <p className="modal-note">No additional player counters were returned by Steam for this game.</p>}
        <a className="inline-link" href={'https://store.steampowered.com/app/' + selectedGame.appId} target="_blank" rel="noreferrer">Open Steam store page <Icon name="external"/></a>
      </section>
    </div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </main>;
}
