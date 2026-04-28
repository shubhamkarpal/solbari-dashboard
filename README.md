# Solbari — Weekly Dashboard

Pure HTML dashboard hosted on Vercel. Data served from Google Apps Script (free). **No API keys, no billing, no Google Cloud project.**

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   HTML on Vercel    │  fetch  │  Apps Script (free)   │
│   (just renders)    │ ──────> │  reads Drive + returns│
│   GitHub → Vercel   │ <────── │  JSON data            │
└─────────────────────┘         └──────────────────────┘
                                         │
                                         ▼
                                ┌──────────────────────┐
                                │   Google Drive        │
                                │   Week 14/ 15/ 16/    │
                                │   CSVs + XLSX files   │
                                └──────────────────────┘
```

## Setup (10 minutes, one-time)

### Step 1: Deploy the Apps Script API

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Delete the default code
3. Copy-paste the contents of `apps-script/Code.gs` into the editor
4. Update `BRAND_FOLDER_ID` with your Drive folder ID (line 18)
5. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → Authorize when prompted → **Copy the URL**

> The URL looks like: `https://script.google.com/macros/s/AKfycbx.../exec`

### Step 2: Add the URL to config

Open `js/config.js` and paste your URL:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx.../exec",
```

### Step 3: Push to GitHub & deploy to Vercel

```bash
git init
git add .
git commit -m "Initial dashboard"
git remote add origin https://github.com/yourorg/solbari-dashboard.git
git push -u origin main
```

Then on [vercel.com](https://vercel.com):
1. Import project → select your repo
2. Framework: **Other**
3. Click **Deploy**

Done. Dashboard is live.

## How It Works

- Page loads → calls your Apps Script URL with `?action=weeks`
- Gets list of week folders from Drive
- User selects a week → calls `?action=week&week=Week 16`
- Apps Script reads CSVs/XLSX from that week folder, processes them, returns JSON
- HTML renders the data (KPIs, charts, tables)
- Trend chart calls `?action=trend` for all weeks summary

## Adding New Weeks

Just drop a new folder (e.g., "Week 17") with the CSV/XLSX files into your Drive folder. It appears in the dashboard automatically.

## Updating the Apps Script

If you change `Code.gs`:
1. Open your script at script.google.com
2. Make changes
3. Deploy → **New Deployment** (not "edit existing")
4. Update the URL in `config.js` if it changed

## Enabling the Drive API Service (if XLSX parsing fails)

The script uses the Advanced Drive Service to convert XLSX files:
1. In the Apps Script editor, click **Services** (+ icon on left sidebar)
2. Find **Drive API** → Click **Add**
3. Re-deploy

## File Structure

```
solbari-dashboard/
├── index.html              ← the dashboard page
├── css/styles.css          ← dark theme
├── js/
│   ├── config.js           ← ONE URL to configure
│   ├── api.js              ← fetches data from Apps Script
│   └── dashboard.js        ← renders everything
├── apps-script/
│   └── Code.gs             ← deploy this to Apps Script
├── vercel.json
└── README.md
```

## Cost

$0. Everything is free:
- Apps Script: free (up to 20,000 requests/day)
- Vercel: free for static sites
- GitHub: free
- Google Drive: you already have it
