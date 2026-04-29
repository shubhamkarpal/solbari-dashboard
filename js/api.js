const API = (() => {
  async function call(params) {
    const qs = Object.entries(params).map(([k,v]) => k+"="+encodeURIComponent(v)).join("&");
    const resp = await fetch(CONFIG.APPS_SCRIPT_URL + "?" + qs);
    const text = await resp.text();
    try { return JSON.parse(text); } catch(e) { throw new Error("Invalid response from Apps Script"); }
  }
  return {
    getWeeks: () => call({ action: "weeks" }),
    getWeekData: (w) => call({ action: "week", week: w }),
    getTrend: () => call({ action: "trend" }),
    refresh: (w) => call({ action: "refresh", week: w || "" }),
    saveNotes: (w, s, r) => call({ action: "savenotes", week: w, summary: s, recs: r }),
  };
})();
