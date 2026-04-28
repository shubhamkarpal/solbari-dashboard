/**
 * API — fetches data from the Apps Script web app
 * No auth, no keys. Just a URL that returns JSON.
 */

const API = (() => {
  async function call(params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const url = `${CONFIG.APPS_SCRIPT_URL}?${qs}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);

    // Apps Script redirects — fetch follows it automatically
    // but sometimes returns text/html, so parse carefully
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid response from Apps Script. Check your deployment URL.");
    }
  }

  async function getWeeks() {
    return call({ action: "weeks" });
  }

  async function getWeekData(weekName) {
    return call({ action: "week", week: weekName });
  }

  async function getTrend() {
    return call({ action: "trend" });
  }

  async function refresh(weekName) {
    return call({ action: "refresh", week: weekName || "" });
  }

  async function saveNotes(weekName, summary, recs) {
    return call({ action: "savenotes", week: weekName, summary: summary, recs: recs });
  }

  return { getWeeks, getWeekData, getTrend, refresh, saveNotes };
})();
