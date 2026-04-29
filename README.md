# Pattern Weekly Dashboard v5

Pure HTML dashboard on Vercel. Data from Apps Script (free). Pattern branded.

## File structure per week (just 2 CSVs)

```
Week 16/
  Solbari_Week_16.csv       ← Combined report (search terms + products + campaigns)
  BusinessReport.csv         ← Amazon business report
```

## Setup

1. **Apps Script**: script.google.com → paste `apps-script/Code.gs` → Deploy as Web App
2. **Config**: paste URL in `js/config.js`
3. **GitHub + Vercel**: push repo → import in Vercel → deployed

## Derived Metrics (calculated automatically)

ROAS = Sales / Spend · ACOS = Spend / Sales × 100 · CPC = Spend / Clicks · CTR = Clicks / Impressions × 100 · CVR = Orders / Clicks × 100

## Cost: $0
