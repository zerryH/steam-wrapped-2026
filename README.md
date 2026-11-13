# Steam Wrapped 2026

Paste a public Steam profile URL, custom profile name, or 17-digit SteamID64 into the website. No Steam login, API key, Python, PowerShell, or local setup.

## Public data

The lookup uses public Steam profile statistics. Your Steam Game Details must be visible to the public. Private game libraries cannot be read.

The current public profile data includes:
- Total recorded lifetime playtime
- Games owned
- Top games by lifetime hours
- Playtime reported for the last two weeks
- Games played recently

It does not contain an exact January–December 2026 playtime history. The page shows the public stats that are available and does not relabel lifetime hours as 2026 hours.

## Data lookup

The site reads a public Steam lookup endpoint through the Jina Reader relay. Neither service requires the visitor to provide an API key or sign in. The profile URL is sent to those services to retrieve the public profile result.

## Run locally

Use npm install, then npm run dev. Build with npm run build.

