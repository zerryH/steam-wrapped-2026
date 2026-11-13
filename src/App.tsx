import { useEffect, useMemo, useRef, useState } from 'react';
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
function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-tile">
    <div className="stat-top">{label}</div>
    <div className="stat-value">{value}</div>
    <div className="stat-detail">{detail}</div>
  </article>;
}

function GameRow({ game, index, maxHours, onClick }: { game: Game; index: number; maxHours: number; onClick: () => void }) {
  const hasTime = game.yearHoursExact !== null;
  const percent = hasTime && maxHours > 0 ? Math.max(2, (game.yearHoursExact! / maxHours) * 100) : 0;
  return <button className="game-row-button" onClick={onClick}>
    <div className="game-row">
      <div className="game-rank">{String(index + 1).padStart(2, '0')}</div>
      <div className="game-image">{game.iconUrl ? <img src={game.iconUrl} alt="" loading="lazy"/> : <span>{game.name.slice(0, 1).toUpperCase()}</span>}</div>
      <div className="game-main">
        <div className="game-title-line"><strong>{game.name}</strong><span>{hasTime ? fmtHours(game.yearHoursExact!) + ' h' : '—'}</span></div>
        <div className="game-bar"><span style={{ width: percent + '%' }}/></div>
        <div className="game-meta">
          <span>{fmtHours(game.playtimeForeverHours)} h lifetime</span>
          {game.yearSessions > 0 && <span>{fmt(game.yearSessions)} sessions</span>}
          {game.achievements2026 > 0 && <span>{game.achievements2026} unlocks</span>}
        </div>
      </div>
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
      setNotice('Imported.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read that JSON file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!data) return <div className="loading-screen"><p>{loadError || 'Loading…'}</p></div>;

  const setup = data.source === 'setup';

  return <main className="page-shell">
    <header className="site-header">
      <a className="wordmark" href="#top">STEAM WRAPPED <span className="wordmark-year">{data.year}</span></a>
      <div className="header-actions">
        <button className="text-button" onClick={() => fileRef.current?.click()}>Import</button>
        <button className="text-button" onClick={downloadData}>Export</button>
      </div>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importData(event.target.files?.[0])}/>
    </header>

    <section className="page-heading" id="top">
      <div>
        <h1>{data.year}</h1>
        {!setup && <div className="profile-line">
          {data.profile.avatar && <img className="avatar" src={data.profile.avatar} alt="" />}
          <strong>{data.profile.name}</strong>
        </div>}
      </div>
      <span className="date-range">JAN 1 — {new Date(data.yearToDate.end + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
    </section>

    {setup ? <section className="setup-panel">
      <div className="setup-copy">
        <h2>No data imported</h2>
        <p>Run the collector on your Steam PC, then import <code>wrapped.json</code>.</p>
        <pre><code>Copy-Item .env.example .env{'\n'}notepad .env{'\n'}python scripts/collect.py</code></pre>
        <a className="setup-link" href="https://github.com/zerryH/steam-wrapped-2026#1-set-up-the-steam-collector-windows" target="_blank" rel="noreferrer">Setup instructions</a>
      </div>
    </section> : <>
      <section className="stats-grid" aria-label="Year statistics">
        <StatTile label="Playtime" value={hasSessionHistory ? fmtHours(data.summary.yearHoursExact!) + 'h' : '—'} detail={hasSessionHistory ? 'Measured hours' : 'No log data'}/>
        <StatTile label="Sessions" value={fmt(data.summary.yearSessions)} detail="Recorded"/>
        <StatTile label="Achievements" value={fmt(data.summary.achievementUnlocked2026)} detail={fmt(data.summary.achievementActiveDays) + ' active days'}/>
        <StatTile label="Active games" value={fmt(data.summary.activeGames2026)} detail={'of ' + fmt(data.summary.totalGames)}/>
      </section>

      <section className="feature-section">
        <div className="section-heading"><h2>{hasSessionHistory ? 'Monthly playtime' : 'Monthly achievements'}</h2></div>
        <div className="timeline-card">
          <div className="timeline-header"><strong>{hasSessionHistory ? fmtHours(data.summary.yearHoursExact!) + ' hours' : fmt(data.summary.achievementUnlocked2026) + ' unlocks'}</strong><span>{hasSessionHistory ? 'Hours' : 'Unlocks'}</span></div>
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
          <div className="timeline-footnote">{hasSessionHistory ? 'Playtime from recoverable local Steam logs.' : 'Achievement dates only. Playtime is unavailable.'}</div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading"><h2>Daily activity</h2></div>
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
          <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={'heat-cell level-' + level}/>)}<span>More</span><small>Hours + unlocks</small></div>
        </div>
        <div className="insight-grid">
          <article className="insight-card"><span className="section-kicker">Most active weekday</span><strong>{hasSessionHistory ? (data.summary.mostPlayedWeekday ?? '—') : '—'}</strong></article>
          <article className="insight-card"><span className="section-kicker">Average session</span><strong>{hasSessionHistory ? duration((data.summary.averageSessionMinutes ?? 0) * 60) : '—'}</strong></article>
          <article className="insight-card"><span className="section-kicker">Longest session</span><strong>{hasSessionHistory ? duration(data.summary.longestSessionSeconds) : '—'}</strong></article>
        </div>
        {hasSessionHistory && <div className="time-perspective">
          <div className="perspective-grid">
            <article><strong>{data.summary.continuousDaysEquivalent.toFixed(1)}</strong><span>24-hour days</span></article>
            <article><strong>{data.summary.eightHourDaysEquivalent.toFixed(1)}</strong><span>8-hour days</span></article>
            <article><strong>{data.summary.averageHoursPerActiveDay?.toFixed(1) ?? '—'} h</strong><span>Per active day</span></article>
          </div>
        </div>}
      </section>

      <section className="feature-section">
        <div className="section-heading"><h2>Top game</h2></div>
        {topSessionGame ? <div className="top-game-card">
          <div className="top-game-image">{topSessionGame.iconUrl ? <img src={topSessionGame.iconUrl} alt=""/> : <span>{topSessionGame.name.slice(0, 1)}</span>}</div>
          <div className="top-game-info"><h3>{topSessionGame.name}</h3>
            <div className="top-game-metrics">
              <div><strong>{fmtHours(topSessionGame.yearHoursExact ?? 0)}h</strong><span>Hours</span></div>
              <div><strong>{fmt(topSessionGame.yearSessions)}</strong><span>Sessions</span></div>
              <div><strong>{fmt(topSessionGame.yearActiveDays)}</strong><span>Days</span></div>
            </div>
            <button className="inline-link" onClick={() => setActiveGame(topSessionGame.appId)}>Details</button>
          </div>
        </div> : <div className="no-history-card">No session log data.</div>}
      </section>

      <section className="feature-section achievements-section">
        <div className="section-heading"><h2>Achievements</h2><span className="heading-side">{fmt(data.summary.achievementUnlocked2026)}</span></div>
        <div className="achievement-summary">
          <article><span className="section-kicker">First</span><strong>{firstAchievement?.displayName ?? '—'}</strong><small>{firstAchievement ? firstAchievement.gameName + ' · ' + dayMonth(firstAchievement.date) : ''}</small></article>
          <article><span className="section-kicker">Latest</span><strong>{lastAchievement?.displayName ?? '—'}</strong><small>{lastAchievement ? lastAchievement.gameName + ' · ' + dayMonth(lastAchievement.date) : ''}</small></article>
        </div>
        {data.activity.achievements.length > 0 ? <div className="achievement-list">
          {[...data.activity.achievements].reverse().slice(0, 12).map((event: AchievementEvent, index) => <div className="achievement-row" key={event.appId + '-' + event.unlockTime + '-' + index}>
            <div className="achievement-copy"><strong>{event.displayName}</strong><span>{event.gameName}</span></div>
            <time>{dayMonth(event.date)}</time>
          </div>)}
          {data.activity.achievements.length > 12 && <p className="list-note">Showing 12 of {fmt(data.activity.achievements.length)}.</p>}
        </div> : <div className="no-history-card small">No dated achievements.</div>}
      </section>

      <section className="feature-section">
        <div className="section-heading"><h2>Games</h2><span className="heading-side">{fmt(data.games.length)}</span></div>
        <div className="library-tools"><label className="search-box"><span className="search-glyph">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games" aria-label="Search games"/></label>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort games"><option value="year">2026 activity</option><option value="lifetime">Lifetime hours</option><option value="name">Name A–Z</option></select>
        </div>
        <div className="game-list">{games.slice(0, 150).map((game, index) => <GameRow key={game.appId} game={game} index={index} maxHours={Math.max(1, ...data.games.map((item) => item.yearHoursExact ?? 0))} onClick={() => setActiveGame(game.appId)}/>)}</div>
        {games.length > 150 && <p className="list-note">Showing 150 of {fmt(games.length)}. Search to view the rest.</p>}
        {games.length === 0 && <p className="empty-state">No matching games.</p>}
      </section>

      <p className="data-note">Playtime uses recoverable local Steam logs. Achievement dates are separate.</p>
    </>}

    {selectedGame && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveGame(null); }}>
      <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" onClick={() => setActiveGame(null)} aria-label="Close">×</button>
        <span className="section-kicker">APP {selectedGame.appId}</span><h2 id="modal-title">{selectedGame.name}</h2>
        <div className="modal-stats">
          <div><strong>{selectedGame.yearHoursExact === null ? '—' : fmtHours(selectedGame.yearHoursExact) + 'h'}</strong><span>{data.year} hours</span></div>
          <div><strong>{fmt(selectedGame.yearSessions)}</strong><span>Sessions</span></div>
          <div><strong>{fmtHours(selectedGame.playtimeForeverHours)}h</strong><span>Lifetime</span></div>
        </div>
        <div className="modal-extra">
          <div><span>Active days</span><strong>{fmt(selectedGame.yearActiveDays)}</strong></div>
          <div><span>Achievements</span><strong>{fmt(selectedGame.achievements2026)}</strong></div>
          <div><span>Longest session</span><strong>{duration(selectedGame.longestSessionSeconds)}</strong></div>
        </div>
        {selectedGame.achievements && <p className="modal-note">{fmt(selectedGame.achievements.unlocked)} / {fmt(selectedGame.achievements.total)} achievements ({selectedGame.achievements.percent}%).</p>}
        {selectedGame.stats && selectedGame.stats.length > 0 && <div className="raw-stats"><span className="section-kicker">PLAYER STATS · LIFETIME</span>{selectedGame.stats.slice(0, 16).map((stat) => <div key={stat.name}><span>{stat.displayName || stat.name}</span><strong>{typeof stat.value === 'number' ? fmt(stat.value) : stat.value}</strong></div>)}</div>}
      </section>
    </div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </main>;
}

