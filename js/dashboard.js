/**
 * Dashboard — renders data + editable summary & recommendations
 */

const Dashboard = (() => {
  let weeks = [];
  let currentWeekIdx = -1;
  let currentWeekName = "";
  let trendChart = null, revSplitChart = null, brandGenChart = null;

  // ── Formatting ─────────────────────────────────────
  const fmt = (n) => { if(n==null)return"—";if(n>=1e6)return"$"+(n/1e6).toFixed(1)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}) };
  const fmtN = (n) => { if(n==null)return"—";if(n>=1e6)return(n/1e6).toFixed(1)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return n.toLocaleString() };
  const fmtPct = (n) => (n != null ? n.toFixed(1) + "%" : "—");
  const fmtDelta = (cur,prev) => { if(cur==null||prev==null||prev===0)return"";const d=((cur-prev)/prev)*100;return`<span class="${d>=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>` };
  const fmtDeltaInv = (cur,prev) => { if(cur==null||prev==null||prev===0)return"";const d=((cur-prev)/prev)*100;return`<span class="${d<=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>` };
  const esc = (s) => { const d=document.createElement("div");d.textContent=s;return d.innerHTML };

  // ── Init ───────────────────────────────────────────
  async function init() {
    showLoading("Fetching week list...");
    try {
      const resp = await API.getWeeks();
      if (resp.error) throw new Error(resp.error);
      weeks = resp.weeks || [];
      if (!weeks.length) { showError("No week folders found in Drive."); return; }
      document.getElementById("brand-title").textContent = resp.brand || "Dashboard";
      const sel = document.getElementById("week-select");
      sel.innerHTML = "";
      weeks.forEach((w, i) => { const o=document.createElement("option"); o.value=i; o.textContent=w; sel.appendChild(o); });
      currentWeekIdx = weeks.length - 1;
      sel.value = currentWeekIdx;
      sel.addEventListener("change", () => { currentWeekIdx=parseInt(sel.value); loadWeek(); });
      await loadWeek();
    } catch (e) {
      console.error(e);
      showError("Error: " + e.message);
    }
  }

  async function loadWeek() {
    currentWeekName = weeks[currentWeekIdx];
    showLoading(`Loading ${currentWeekName}...`);
    try {
      const data = await API.getWeekData(currentWeekName);
      if (data.error) throw new Error(data.error);
      render(data.cur, data.prev);
      hideLoading();
      API.getTrend().then(renderTrend).catch(() => {});
    } catch (e) { showError("Error loading week: " + e.message); }
  }

  // ── Render ─────────────────────────────────────────
  function render(d, p) {
    if (!d) return;
    document.getElementById("week-label").textContent = d.label + " Ad Performance" + (p ? ` (vs ${p.label})` : "");

    setKPI("kpi-sales",fmt(d.sales),p?fmtDelta(d.sales,p.sales):"",p?`${p.label}: ${fmt(p.sales)}`:"");
    setKPI("kpi-spend",fmt(d.spend),p?fmtDelta(d.spend,p.spend):"",p?`${p.label}: ${fmt(p.spend)}`:"");
    setKPI("kpi-roas",d.roas?d.roas.toFixed(2):"—",p?fmtDelta(d.roas,p.roas):"",p?`${p.label}: ${p.roas}`:"");
    setKPI("kpi-acos",fmtPct(d.acos),p?fmtDeltaInv(d.acos,p.acos):"",p?`${p.label}: ${fmtPct(p.acos)}`:"");
    setKPI("kpi-orders",fmtN(d.orders),p?fmtDelta(d.orders,p.orders):"",p?`${p.label}: ${fmtN(p.orders)}`:"");
    setKPI("kpi-clicks",fmtN(d.clicks),p?fmtDelta(d.clicks,p.clicks):"",p?`${p.label}: ${fmtN(p.clicks)}`:"");
    setKPI("kpi-imp",fmtN(d.imp),p?fmtDelta(d.imp,p.imp):"",p?`${p.label}: ${fmtN(p.imp)}`:"");
    setKPI("kpi-cvr",fmtPct(d.cvr),p?fmtDelta(d.cvr,p.cvr):"",p?`${p.label}: ${fmtPct(p.cvr)}`:"");

    const biz = d.business || {};
    document.getElementById("biz-revenue").textContent = fmt(biz.revenue||0);
    document.getElementById("biz-orders").textContent = fmtN(biz.totalOrders||0);
    document.getElementById("biz-sessions").textContent = fmtN(biz.sessions||0);
    document.getElementById("biz-buybox").textContent = fmtPct(biz.avgBuyBox||0);

    renderRevSplit(d.sales||0, biz.revenue ? Math.max(0, biz.revenue-(d.sales||0)) : 0);
    const bc=d.brandCampaigns||{}, gc=d.genericCampaigns||{};
    renderBrandGen(bc.sales||0, gc.sales||0);

    document.getElementById("brand-roas").textContent=bc.roas||"—";
    document.getElementById("brand-spend").textContent=fmt(bc.spend);
    document.getElementById("brand-sales2").textContent=fmt(bc.sales);
    document.getElementById("brand-acos").textContent=fmtPct(bc.acos);
    document.getElementById("generic-roas").textContent=gc.roas||"—";
    document.getElementById("generic-spend").textContent=fmt(gc.spend);
    document.getElementById("generic-sales2").textContent=fmt(gc.sales);
    document.getElementById("generic-acos").textContent=fmtPct(gc.acos);

    renderSearchTerms(d.searchTermsTop, d.searchTermsLow, d.searchTermsOpp);
    renderProducts(d.products, p ? p.products : null);
    renderMTD(d.mtd);

    // Executive Summary — saved overrides auto-generated
    const autoSummary = generateSummary(d, p);
    const summaryText = d.savedSummary || autoSummary;
    document.getElementById("summary-display").innerHTML = summaryText.split("\n").map(l => `<p>${l}</p>`).join("");
    document.getElementById("summary-edit").value = summaryText;

    // Recommendations
    const recsText = d.savedRecs || "";
    document.getElementById("recs-display").innerHTML = recsText ? formatRecs(recsText) : '<p class="text-muted">Click Edit to add recommendations.</p>';
    document.getElementById("recs-edit").value = recsText;
  }

  function generateSummary(d, p) {
    const lines = [];
    if (d.sales && d.spend) {
      const sd = p&&p.sales ? ((d.sales-p.sales)/p.sales*100).toFixed(1) : null;
      const trend = sd!==null ? (Math.abs(sd)<3?"held roughly flat":(sd>0?`grew ${sd}%`:`declined ${Math.abs(sd)}%`)) : "";
      lines.push(`Sales ${trend} WoW at ${fmt(d.sales)} on ${fmt(d.spend)} in spend; ROAS moved to ${d.roas} (ACOS ${fmtPct(d.acos)}).`);
    }
    if (d.imp && p && p.imp) {
      const impD=((d.imp-p.imp)/p.imp*100).toFixed(0), clkD=p.clicks?((d.clicks-p.clicks)/p.clicks*100).toFixed(0):0;
      lines.push(`Top of funnel: impressions ${impD>0?"+":""}${impD}% and clicks ${clkD>0?"+":""}${clkD}%, CPC at ~${fmt(d.cpc)}.`);
    }
    const bc=d.brandCampaigns||{}, gc=d.genericCampaigns||{};
    if (bc.spend && gc.spend) {
      const bp=(bc.spend/d.spend*100).toFixed(0), bsp=(bc.sales/d.sales*100).toFixed(0);
      lines.push(`Branded: ${bp}% of spend → ${bsp}% of sales; non-brand ROAS at ${gc.roas}x.`);
    }
    if (d.ntbOrders>0) lines.push(`${fmtN(d.orders)} orders, ${d.ntbOrders} new-to-brand (${fmt(d.ntbSales)} incremental).`);
    return lines.join("\n");
  }

  function formatRecs(text) {
    // Each line is a recommendation. Lines starting with HIGH/MED/LOW get colored badges
    return text.split("\n").filter(l=>l.trim()).map(line => {
      let badge = "", content = line;
      const m = line.match(/^(HIGH|MED|LOW)\s*[:\-–—]?\s*(.*)/i);
      if (m) {
        const level = m[1].toUpperCase();
        badge = `<span class="rec-badge ${level.toLowerCase()}">${level}</span>`;
        content = m[2];
      }
      return `<div class="rec-item">${badge}<span class="rec-text">${esc(content)}</span></div>`;
    }).join("");
  }

  function setKPI(id,value,delta,sub){const el=document.getElementById(id);if(!el)return;el.querySelector(".kpi-value").innerHTML=value;el.querySelector(".kpi-delta").innerHTML=delta;const s=el.querySelector(".kpi-sub");if(s)s.textContent=sub||""}

  // ── Charts ─────────────────────────────────────────
  function renderTrend(data){if(!data||!data.weeks)return;const canvas=document.getElementById("trend-chart");if(!canvas)return;const labels=data.weekOrder||Object.keys(data.weeks);const salesData=labels.map(l=>data.weeks[l]?data.weeks[l].sales:null);if(trendChart)trendChart.destroy();trendChart=new Chart(canvas,{type:"line",data:{labels,datasets:[{label:"Ad Sales",data:salesData,borderColor:"#00d4ff",backgroundColor:"rgba(0,212,255,0.08)",fill:true,tension:.3,pointRadius:5,pointBackgroundColor:"#00d4ff"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#8b95a5"},grid:{color:"rgba(255,255,255,0.05)"}},y:{ticks:{color:"#8b95a5",callback:v=>"$"+(v>=1000?(v/1000).toFixed(0)+"K":v)},grid:{color:"rgba(255,255,255,0.05)"}}}}})}

  function renderRevSplit(a,o){const c=document.getElementById("rev-split-chart");if(!c)return;if(revSplitChart)revSplitChart.destroy();revSplitChart=new Chart(c,{type:"doughnut",data:{labels:["Ad Sales","Organic"],datasets:[{data:[a,o],backgroundColor:["#3b82f6","#f97316"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#8b95a5",padding:16,usePointStyle:true}}}}})}

  function renderBrandGen(b,g){const c=document.getElementById("brand-gen-chart");if(!c)return;if(brandGenChart)brandGenChart.destroy();brandGenChart=new Chart(c,{type:"doughnut",data:{labels:["Brand","Generic"],datasets:[{data:[b,g],backgroundColor:["#10b981","#f97316"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#8b95a5",padding:16,usePointStyle:true}}}}})}

  // ── Tables ─────────────────────────────────────────
  function renderSearchTerms(top,low,opp){
    const topBody=document.getElementById("search-top-body");topBody.innerHTML="";
    if(top&&top.length)top.forEach(t=>{topBody.innerHTML+=`<tr><td>${esc(t.term)}</td><td>${fmt(t.sales)}</td><td>${fmt(t.spend)}</td><td class="${t.roas>=5?'text-green':t.roas>=3?'text-yellow':'text-red'}">${t.roas}</td><td>${t.orders}</td><td>${fmtN(t.clicks)}</td></tr>`});
    else topBody.innerHTML='<tr><td colspan="6" class="text-muted">No XLSX data — check Drive Advanced Service is enabled in Apps Script</td></tr>';
    const lowBody=document.getElementById("search-low-body");lowBody.innerHTML="";
    if(low&&low.length)low.forEach(t=>{lowBody.innerHTML+=`<tr><td>${esc(t.term)}</td><td class="text-red">${fmt(t.spend)}</td><td>${t.clicks}</td></tr>`});
    else lowBody.innerHTML='<tr><td colspan="3" class="text-muted">None this week</td></tr>';
    const oppBody=document.getElementById("search-opp-body");oppBody.innerHTML="";
    if(opp&&opp.length)opp.forEach(t=>{oppBody.innerHTML+=`<tr><td>${esc(t.term)}</td><td>${fmt(t.sales)}</td><td>${fmt(t.spend)}</td><td class="text-green">${t.roas}</td></tr>`});
  }

  function renderProducts(products,prevProducts){
    const body=document.getElementById("products-body");body.innerHTML="";
    if(!products||!products.length){body.innerHTML='<tr><td colspan="5" class="text-muted">No XLSX data — check Drive Advanced Service</td></tr>';return}
    const prevMap={};if(prevProducts)prevProducts.forEach(p=>{prevMap[p.asin]=p});
    products.slice(0,10).forEach(p=>{body.innerHTML+=`<tr><td class="product-name">${esc(p.title)}</td><td>${fmt(p.sales)}</td><td>${fmt(p.spend)}</td><td class="${p.roas>=5?'text-green':p.roas>=3?'text-yellow':'text-red'}">${p.roas}</td><td>${p.orders}</td></tr>`});
    if(prevProducts){
      const accBody=document.getElementById("acc-body");accBody.innerHTML="";
      const decBody=document.getElementById("dec-body");decBody.innerHTML="";
      products.forEach(p=>{const prev=prevMap[p.asin];if(!prev||prev.sales===0)return;const wow=((p.sales-prev.sales)/prev.sales*100);
        if(wow>=20)accBody.innerHTML+=`<tr><td class="product-name">${esc(p.title)}</td><td>${fmt(p.sales)}</td><td>${fmt(prev.sales)}</td><td class="text-green">+${wow.toFixed(1)}%</td><td class="${p.roas>=5?'text-green':'text-yellow'}">${p.roas}</td><td>${p.orders}</td></tr>`;
        if(wow<=-20)decBody.innerHTML+=`<tr><td class="product-name">${esc(p.title)}</td><td>${fmt(p.sales)}</td><td>${fmt(prev.sales)}</td><td class="text-red">${wow.toFixed(1)}%</td><td class="${p.roas>=5?'text-green':'text-yellow'}">${p.roas}</td><td>${p.orders}</td></tr>`;
      });
    }
  }

  function renderMTD(mtd){const sec=document.getElementById("mtd-section");if(!mtd){sec.style.display="none";return}sec.style.display="";document.getElementById("mtd-day").textContent=mtd.day;document.getElementById("mtd-days").textContent=mtd.monthDays;document.getElementById("mtd-spend-val").textContent=fmt(mtd.mtdSpend);document.getElementById("mtd-spend-target").textContent=fmt(mtd.spendForecast);document.getElementById("mtd-spend-bar").style.width=Math.min(mtd.spendPct,100)+"%";const spDiff=mtd.spendPct-(mtd.day/mtd.monthDays*100);const spN=document.getElementById("mtd-spend-note");spN.textContent=(spDiff>=0?"▲ ":"▼ ")+Math.abs(spDiff).toFixed(1)+"% "+(spDiff>=0?"ahead":"behind");spN.className="mtd-bar-note "+(spDiff>=0?"text-green":"text-red");document.getElementById("mtd-rev-val").textContent=fmt(mtd.mtdSales);document.getElementById("mtd-rev-target").textContent=fmt(mtd.salesForecast);document.getElementById("mtd-rev-bar").style.width=Math.min(mtd.salesPct,100)+"%";const rvDiff=mtd.salesPct-(mtd.day/mtd.monthDays*100);const rvN=document.getElementById("mtd-rev-note");rvN.textContent=(rvDiff>=0?"▲ ":"▼ ")+Math.abs(rvDiff).toFixed(1)+"% "+(rvDiff>=0?"ahead":"behind");rvN.className="mtd-bar-note "+(rvDiff>=0?"text-green":"text-red");document.getElementById("mtd-roas").textContent=mtd.roasMtd;document.getElementById("mtd-roas-target").textContent=mtd.roasTarget}

  // ── Save Notes ─────────────────────────────────────
  async function saveAllNotes() {
    const summary = document.getElementById("summary-edit").value;
    const recs = document.getElementById("recs-edit").value;
    try {
      await API.saveNotes(currentWeekName, summary, recs);
      document.getElementById("summary-display").innerHTML = summary.split("\n").map(l=>`<p>${l}</p>`).join("");
      document.getElementById("recs-display").innerHTML = recs ? formatRecs(recs) : '<p class="text-muted">No recommendations.</p>';
      toggleEdit("summary", false);
      toggleEdit("recs", false);
    } catch(e) { alert("Save failed: " + e.message); }
  }

  function toggleEdit(section, show) {
    const display = document.getElementById(section + "-display");
    const edit = document.getElementById(section + "-edit");
    const btnEdit = document.getElementById(section + "-btn-edit");
    const btnSave = document.getElementById(section + "-btn-save");
    const btnCancel = document.getElementById(section + "-btn-cancel");
    if (show) {
      display.style.display = "none"; edit.style.display = "block";
      btnEdit.style.display = "none"; btnSave.style.display = "inline"; btnCancel.style.display = "inline";
    } else {
      display.style.display = ""; edit.style.display = "none";
      btnEdit.style.display = "inline"; btnSave.style.display = "none"; btnCancel.style.display = "none";
    }
  }

  // ── UI ─────────────────────────────────────────────
  function showLoading(msg){const el=document.getElementById("loading-overlay");if(el){el.querySelector(".loading-text").textContent=msg;el.classList.remove("hidden")}}
  function hideLoading(){const el=document.getElementById("loading-overlay");if(el)el.classList.add("hidden")}
  function showError(msg){hideLoading();const el=document.getElementById("error-msg");if(el){el.textContent=msg;el.classList.remove("hidden")}}

  return { init, loadWeek, saveAllNotes, toggleEdit };
})();

// ── Boot ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  Dashboard.init();
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    document.getElementById("error-msg").classList.add("hidden");
    const sel=document.getElementById("week-select");
    await API.refresh(sel.options[sel.selectedIndex]?.textContent||"");
    Dashboard.loadWeek();
  });
});
