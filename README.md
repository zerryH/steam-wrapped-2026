# Steam Wrapped 2026

Paste a public Steam profile URL, custom profile name, or 17-digit SteamID64. No Steam login, API key, local install, or file import is needed.

## The story

The wrap is presented one slide at a time. Each slide uses profile-specific copy selected deterministically from a hand-written banter bank with **2,500 possible combinations per slide**. The line is based on the SteamID and the values on that slide, so it stays consistent for the same snapshot and changes when the profile data changes.

## Personal progress history

On the first lookup, the site saves a baseline in the browser's local storage. On later lookups in that same browser, it compares the public lifetime-hour totals and the returned top games. It can show hour increases and calculated playtime milestones crossed since the previous snapshot.

This is a local browser history, not a cloud database. It is not shared across devices or browsers. It can only compare games that appear in the public top-title data returned by the lookup.

## What it can and cannot show

The public lookup currently provides:
- Total recorded lifetime playtime
- Games owned
- Top games by lifetime hours
- Recently played games and a recent activity figure

It does **not** provide an exact January–December 2026 playtime history through this public feed. The wrap does not relabel lifetime hours as 2026 hours.

Playtime checkpoints (25, 50, 100, 250, 500, 1,000 hours and beyond) are calculated by this site. They are **not** the game's actual Steam achievements. Individual achievement unlocks and unlock dates are not included in this feed.

Some public profile sources return incomplete or inconsistent recent-hour figures. Values above the physical 14-day maximum are treated as unavailable instead of being shown as fact.

## Data lookup

The site reads a public Steam lookup endpoint through the Jina Reader relay. The Steam profile URL is sent to those services to retrieve the public profile result. No Steam password, sign-in, or API key is requested.

Steam Game Details must be visible to the public. Private game libraries cannot be read.

## Automatic game artwork

Game images come from the current public Steam Store app-details feed: the publisher's current header art and full-size store screenshots, not old user-customized Steam library covers. The site rechecks the image URLs every 12 hours in each browser, so publisher changes appear automatically without a monthly site update. Requests use the public Store endpoint through a CORS relay; only Steam App IDs are sent for artwork. No Steam login or API key is used.

Steam screenshots are served at the best size the publisher has uploaded (often 1920×1080). 4K is used only when the Store actually supplies it. Delisted games or games without public Store media can have no current artwork.

## Run locally

\`npm install\`, then \`npm run dev\`. Build with \`npm run build\`.