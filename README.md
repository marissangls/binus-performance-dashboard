# AIESEC in BINUS Performance Dashboard

A one-page dashboard that shows the performance of AIESEC in BINUS for oGX and iCX: the number of people in each phase (Open to Completed) and the conversion rates, for any date range.

**Live demo:** https://binus-performance-dashboard.vercel.app/

## Features

- Counts per phase: Open, Applied, Accepted, Approved, Realized, Finished, Completed
- Conversion rates: Applied to Realized, and each phase compared with the one before it
- oGX split by product (All, oGV, oGTa) and iCX (iGV)
- Start and end date filters
- CSV report export

## Tech stack

- Frontend: plain HTML, CSS and JavaScript (`index.html`)
- Backend: Node.js serverless functions (`api/`), no dependencies
- Data: EXPA Analytics API, with saved snapshots for the public demo
- Hosting: Vercel

## Getting started

Requirements: Node.js 18 or newer.

```
node dev-server.js
```

Then open http://localhost:3000.

### Configuration

Copy `.env.example` to `.env.local` to change the settings. Never commit `.env.local`.

| Variable | Description | Default |
| --- | --- | --- |
| `DATA_MODE` | `mock` reads the saved data in `fixtures/`. `live` calls the EXPA API. | `mock` |
| `OFFICE_ID` | EXPA office ID of the LC | `2871` |
| `LC_NAME` | Name shown on the page | `AIESEC in BINUS` |
| `EXPA_TOKEN` | EXPA access token, only needed in `live` mode | none |

## How it works

The page asks `/api/stats` for the numbers. The server function reads them from the EXPA Analytics API (live mode) or from `fixtures/` (mock mode) and returns them as JSON. The EXPA token stays on the server as an environment variable and is never sent to the browser.

## Updating the data

The public demo shows saved data, because EXPA's quick access token expires after 2 hours. To refresh it:

1. In EXPA, open the analytics page, find the `analyze.json` request in the browser's Network tab, and copy its full URL.
2. In PowerShell, in the project folder:

   ```
   $env:EXPA_URL="<the copied URL>"
   node pull-months.mjs 2026
   node pull-days.mjs 2026
   ```

   `2026` is the year the AIESEC term starts (February to January). Run these soon after copying the URL, while the token still works.
3. Commit the new files in `fixtures/` and push. Vercel deploys again by itself.

Once a permanent token from an EXPA Developer Application is available, add it as `EXPA_TOKEN` in Vercel and set `DATA_MODE=live`. The dashboard then reads EXPA directly, and the steps above are no longer needed.

## Deployment

The project is deployed on Vercel (framework preset: Other). The settings in the table above are set in the Vercel project under Settings, Environment Variables.

## Project structure

```
index.html        dashboard page
api/              server functions (stats.js, me.js)
lib/stats.js      reads EXPA data and calculates the numbers
fixtures/         saved EXPA data
pull-months.mjs   saves monthly data and the whole period
pull-days.mjs     saves daily data
dev-server.js     local server
report/           exported CSV reports
```
