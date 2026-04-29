const Dashboard = (() => {
  let weeks=[], currentWeekIdx=-1, currentWeekName="";
  let trendChart=null, revSplitChart=null, brandGenChart=null;

  const fmt = n => {if(n==null)return"—";if(n>=1e6)return"$"+(n/1e6).toFixed(1)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})};
  const fmtN = n => {if(n==null)return"—";if(n>=1e6)return(n/1e6).toFixed(1)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return n.toLocaleString()};
  const fmtPct = n => n!=null?n.toFixed(1)+"%":"—";
  const fmtD = (c,p) => {if(c==null||p==null||p===0)return"";const d=((c-p)/p)*100;return`<span class="${d>=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>`};
  const fmtDI = (c,p) => {if(c==null||p==null||p===0)return"";const d=((c-p)/p)*100;return`<span class="${d<=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>`};
  const esc = s => {const d=document.createElement("div");d.textContent=s;return d.innerHTML};

  async function init() {
    showLoading("Connecting...");
    try {
      const resp = await API.getWeeks();
      if (resp.error) throw new Error(resp.error);
      weeks = resp.weeks || [];
      if (!weeks.length) { showError("No week folders found."); return; }
      document.getElementById("brand-title").textContent = resp.brand || "Dashboard";
      const sel = document.getElementById("week-select");
      sel.innerHTML = "";
      weeks.forEach((w,i) => {const o=document.createElement("option");o.value=i;o.textContent=w;sel.appendChild(o)});
      currentWeekIdx = weeks.length - 1;
      sel.value = currentWeekIdx;
      sel.addEventListener("change", () => {currentWeekIdx=parseInt(sel.value);loadWeek()});
      await loadWeek();
    } catch(e) { showError("Error: "+e.message); }
  }

  async function loadWeek() {
    currentWeekName = weeks[currentWeekIdx];
    showLoading("Loading "+currentWeekName+"...");
    try {
      const data = await API.getWeekData(currentWeekName);
      if (data.error) throw new Error(data.error);
      render(data.cur, data.prev);
      hideLoading();
      API.getTrend().then(renderTrend).catch(()=>{});
    } catch(e) { showError("Error: "+e.message); }
  }

  function render(d, p) {
    if (!d) return;
    document.getElementById("week-label").textContent = d.label+" Ad Performance"+(p?" (vs "+p.label+")":"");
    setKPI("kpi-sales",fmt(d.sales),p?fmtD(d.sales,p.sales):"",p?p.label+": "+fmt(p.sales):"");
    setKPI("kpi-spend",fmt(d.spend),p?fmtD(d.spend,p.spend):"",p?p.label+": "+fmt(p.spend):"");
    setKPI("kpi-roas",d.roas?d.roas.toFixed(2):"—",p?fmtD(d.roas,p.roas):"",p?p.label+": "+p.roas:"");
    setKPI("kpi-acos",fmtPct(d.acos),p?fmtDI(d.acos,p.acos):"",p?p.label+": "+fmtPct(p.acos):"");
    setKPI("kpi-orders",fmtN(d.orders),p?fmtD(d.orders,p.orders):"",p?p.label+": "+fmtN(p.orders):"");
    setKPI("kpi-clicks",fmtN(d.clicks),p?fmtD(d.clicks,p.clicks):"",p?p.label+": "+fmtN(p.clicks):"");
    setKPI("kpi-imp",fmtN(d.imp),p?fmtD(d.imp,p.imp):"",p?p.label+": "+fmtN(p.imp):"");
    setKPI("kpi-cvr",fmtPct(d.cvr),p?fmtD(d.cvr,p.cvr):"",p?p.label+": "+fmtPct(p.cvr):"");

    const biz=d.business||{};
    document.getElementById("biz-revenue").textContent=fmt(biz.revenue||0);
    document.getElementById("biz-orders").textContent=fmtN(biz.totalOrders||0);
    document.getElementById("biz-sessions").textContent=fmtN(biz.sessions||0);
    document.getElementById("biz-buybox").textContent=fmtPct(biz.avgBuyBox||0);

    renderRevSplit(d.sales||0,biz.revenue?Math.max(0,biz.revenue-(d.sales||0)):0);
    const bc=d.brandCampaigns||{},gc=d.genericCampaigns||{};
    renderBrandGen(bc.sales||0,gc.sales||0);

    document.getElementById("brand-roas").textContent=bc.roas||"—";document.getElementById("brand-spend").textContent=fmt(bc.spend);document.getElementById("brand-sales2").textContent=fmt(bc.sales);document.getElementById("brand-acos").textContent=fmtPct(bc.acos);
    document.getElementById("generic-roas").textContent=gc.roas||"—";document.getElementById("generic-spend").textContent=fmt(gc.spend);document.getElementById("generic-sales2").textContent=fmt(gc.sales);document.getElementById("generic-acos").textContent=fmtPct(gc.acos);

    renderFunnel(d.funnel);renderMTD(d.mtd);
    renderSearchTerms(d.searchTermsTop,d.searchTermsLow,d.searchTermsOpp);
    renderProducts(d.products,p?p.products:null);

    const auto=genSummary(d,p),txt=d.savedSummary||auto;
    document.getElementById("summary-display").innerHTML=txt.split("\n").map(l=>"<p>"+l+"</p>").join("");
    document.getElementById("summary-edit").value=txt;
    const recs=d.savedRecs||"";
    document.getElementById("recs-display").innerHTML=recs?fmtRecs(recs):'<p class="text-muted">Click Edit to add recommendations.</p>';
    document.getElementById("recs-edit").value=recs;
  }

  function genSummary(d,p){const l=[];if(d.sales&&d.spend){const sd=p&&p.sales?((d.sales-p.sales)/p.sales*100).toFixed(1):null;const tr=sd!==null?(Math.abs(sd)<3?"held roughly flat":(sd>0?"grew "+sd+"%":"declined "+Math.abs(sd)+"%")):"";l.push("Sales "+tr+" WoW at "+fmt(d.sales)+" on "+fmt(d.spend)+" in spend; ROAS moved to "+d.roas+" (ACOS "+fmtPct(d.acos)+").")}if(d.imp&&p&&p.imp){l.push("Top of funnel: impressions "+((d.imp-p.imp)/p.imp*100).toFixed(0)+"% and clicks "+(p.clicks?((d.clicks-p.clicks)/p.clicks*100).toFixed(0):0)+"%, CPC at ~"+fmt(d.cpc)+".")}const bc=d.brandCampaigns||{},gc=d.genericCampaigns||{};if(bc.spend&&gc.spend)l.push("Branded: "+(bc.spend/d.spend*100).toFixed(0)+"% of spend → "+(bc.sales/d.sales*100).toFixed(0)+"% of sales; non-brand ROAS at "+gc.roas+"x.");if(d.ntbOrders>0)l.push(fmtN(d.orders)+" orders, "+d.ntbOrders+" new-to-brand ("+fmt(d.ntbSales)+" incremental).");return l.join("\n")}

  function fmtRecs(text){return text.split("\n").filter(l=>l.trim()).map(line=>{let badge="",content=line;const m=line.match(/^(HIGH|MED|LOW)\s*[:\-–—]?\s*(.*)/i);if(m){badge='<span class="rec-badge '+m[1].toLowerCase()+'">'+m[1].toUpperCase()+'</span>';content=m[2]}return'<div class="rec-item">'+badge+'<span class="rec-text">'+esc(content)+'</span></div>'}).join("")}

  function setKPI(id,v,d,s){const el=document.getElementById(id);if(!el)return;el.querySelector(".kpi-value").innerHTML=v;el.querySelector(".kpi-delta").innerHTML=d;const sub=el.querySelector(".kpi-sub");if(sub)sub.textContent=s||""}

  function renderFunnel(f){const sec=document.getElementById("funnel-section");if(!f){sec.style.display="none";return}sec.style.display="";
    document.getElementById("funnel-imp-val").textContent=fmtN(f.impressions);document.getElementById("funnel-clicks-val").textContent=fmtN(f.clicks);document.getElementById("funnel-orders-val").textContent=fmtN(f.orders);
    document.getElementById("funnel-ctr").textContent="CTR "+fmtPct(f.ctr);document.getElementById("funnel-cvr").textContent="CVR "+fmtPct(f.cvr);
    document.getElementById("funnel-bar-imp").style.width="100%";
    const clW=f.impressions>0?Math.max((f.clicks/f.impressions)*100*15,25):25;
    const odW=f.impressions>0?Math.max((f.orders/f.impressions)*100*150,12):12;
    document.getElementById("funnel-bar-clicks").style.width=Math.min(clW,100)+"%";
    document.getElementById("funnel-bar-orders").style.width=Math.min(odW,100)+"%"}

  function renderTrend(data){if(!data||!data.weeks)return;const c=document.getElementById("trend-chart");if(!c)return;const labels=data.weekOrder||Object.keys(data.weeks);const sd=labels.map(l=>data.weeks[l]?data.weeks[l].sales:null);if(trendChart)trendChart.destroy();trendChart=new Chart(c,{type:"line",data:{labels,datasets:[{label:"Ad Sales",data:sd,borderColor:"#0096FA",backgroundColor:"rgba(0,150,250,0.08)",fill:true,tension:.3,pointRadius:5,pointBackgroundColor:"#0096FA"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#C4D3E3"},grid:{color:"rgba(255,255,255,0.04)"}},y:{ticks:{color:"#C4D3E3",callback:v=>"$"+(v>=1000?(v/1000).toFixed(0)+"K":v)},grid:{color:"rgba(255,255,255,0.04)"}}}}})}

  function renderRevSplit(a,o){const c=document.getElementById("rev-split-chart");if(!c)return;if(revSplitChart)revSplitChart.destroy();revSplitChart=new Chart(c,{type:"doughnut",data:{labels:["Ad Sales","Organic"],datasets:[{data:[a,o],backgroundColor:["#3A55FF","#770BFF"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#C4D3E3",padding:16,usePointStyle:true}}}}})}

  function renderBrandGen(b,g){const c=document.getElementById("brand-gen-chart");if(!c)return;if(brandGenChart)brandGenChart.destroy();brandGenChart=new Chart(c,{type:"doughnut",data:{labels:["Brand","Generic"],datasets:[{data:[b,g],backgroundColor:["#0096FA","#770BFF"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#C4D3E3",padding:16,usePointStyle:true}}}}})}

  function renderSearchTerms(top,low,opp){
    const tb=document.getElementById("search-top-body");tb.innerHTML="";
    if(top&&top.length)top.forEach(t=>{tb.innerHTML+='<tr><td>'+esc(t.term)+'</td><td>'+fmt(t.sales)+'</td><td>'+fmt(t.spend)+'</td><td class="'+(t.roas>=5?'text-green':t.roas>=3?'text-yellow':'text-red')+'">'+t.roas+'</td><td>'+t.orders+'</td><td>'+fmtN(t.clicks)+'</td></tr>'});
    else tb.innerHTML='<tr><td colspan="6" class="text-muted">No search term data</td></tr>';
    const lb=document.getElementById("search-low-body");lb.innerHTML="";
    if(low&&low.length)low.forEach(t=>{lb.innerHTML+='<tr><td>'+esc(t.term)+'</td><td class="text-red">'+fmt(t.spend)+'</td><td>'+t.clicks+'</td></tr>'});
    else lb.innerHTML='<tr><td colspan="3" class="text-muted">None this week</td></tr>';
    const ob=document.getElementById("search-opp-body");ob.innerHTML="";
    if(opp&&opp.length)opp.forEach(t=>{ob.innerHTML+='<tr><td>'+esc(t.term)+'</td><td>'+fmt(t.sales)+'</td><td>'+fmt(t.spend)+'</td><td class="text-green">'+t.roas+'</td></tr>'})
  }

  function renderProducts(products,prevProducts){
    const body=document.getElementById("products-body");body.innerHTML="";
    if(!products||!products.length){body.innerHTML='<tr><td colspan="5" class="text-muted">No product data</td></tr>';return}
    const pm={};if(prevProducts)prevProducts.forEach(p=>{pm[p.asin]=p});
    products.slice(0,10).forEach(p=>{body.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(p.spend)+'</td><td class="'+(p.roas>=5?'text-green':p.roas>=3?'text-yellow':'text-red')+'">'+p.roas+'</td><td>'+p.orders+'</td></tr>'});
    if(prevProducts){
      const ab=document.getElementById("acc-body"),db=document.getElementById("dec-body");ab.innerHTML="";db.innerHTML="";
      products.forEach(p=>{const prev=pm[p.asin];if(!prev||prev.sales===0)return;const wow=((p.sales-prev.sales)/prev.sales*100);
        if(wow>=20)ab.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(prev.sales)+'</td><td class="text-green">+'+wow.toFixed(1)+'%</td><td>'+p.roas+'</td><td>'+p.orders+'</td></tr>';
        if(wow<=-20)db.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(prev.sales)+'</td><td class="text-red">'+wow.toFixed(1)+'%</td><td>'+p.roas+'</td><td>'+p.orders+'</td></tr>'})}}

  function renderMTD(mtd){const sec=document.getElementById("mtd-section");if(!mtd){sec.style.display="none";return}sec.style.display="";document.getElementById("mtd-day").textContent=mtd.day;document.getElementById("mtd-days").textContent=mtd.monthDays;document.getElementById("mtd-spend-val").textContent=fmt(mtd.mtdSpend);document.getElementById("mtd-spend-target").textContent=fmt(mtd.spendForecast);document.getElementById("mtd-spend-bar").style.width=Math.min(mtd.spendPct,100)+"%";const sd=mtd.spendPct-(mtd.day/mtd.monthDays*100);const sn=document.getElementById("mtd-spend-note");sn.textContent=(sd>=0?"▲ ":"▼ ")+Math.abs(sd).toFixed(1)+"% "+(sd>=0?"ahead":"behind");sn.className="mtd-bar-note "+(sd>=0?"text-green":"text-red");document.getElementById("mtd-rev-val").textContent=fmt(mtd.mtdSales);document.getElementById("mtd-rev-target").textContent=fmt(mtd.salesForecast);document.getElementById("mtd-rev-bar").style.width=Math.min(mtd.salesPct,100)+"%";const rd=mtd.salesPct-(mtd.day/mtd.monthDays*100);const rn=document.getElementById("mtd-rev-note");rn.textContent=(rd>=0?"▲ ":"▼ ")+Math.abs(rd).toFixed(1)+"% "+(rd>=0?"ahead":"behind");rn.className="mtd-bar-note "+(rd>=0?"text-green":"text-red");document.getElementById("mtd-roas").textContent=mtd.roasMtd;document.getElementById("mtd-roas-target").textContent=mtd.roasTarget}

  async function saveAllNotes(){const s=document.getElementById("summary-edit").value,r=document.getElementById("recs-edit").value;try{await API.saveNotes(currentWeekName,s,r);document.getElementById("summary-display").innerHTML=s.split("\n").map(l=>"<p>"+l+"</p>").join("");document.getElementById("recs-display").innerHTML=r?fmtRecs(r):'<p class="text-muted">No recommendations.</p>';toggleEdit("summary",false);toggleEdit("recs",false)}catch(e){alert("Save failed: "+e.message)}}

  function toggleEdit(sec,show){const d=document.getElementById(sec+"-display"),e=document.getElementById(sec+"-edit"),bE=document.getElementById(sec+"-btn-edit"),bS=document.getElementById(sec+"-btn-save"),bC=document.getElementById(sec+"-btn-cancel");if(show){d.style.display="none";e.style.display="block";bE.style.display="none";bS.style.display="inline";bC.style.display="inline"}else{d.style.display="";e.style.display="none";bE.style.display="inline";bS.style.display="none";bC.style.display="none"}}

  function showLoading(m){const el=document.getElementById("loading-overlay");if(el){el.querySelector(".loading-text").textContent=m;el.classList.remove("hidden")}}
  function hideLoading(){const el=document.getElementById("loading-overlay");if(el)el.classList.add("hidden")}
  function showError(m){hideLoading();const el=document.getElementById("error-msg");if(el){el.textContent=m;el.classList.remove("hidden")}}

  return { init, loadWeek, saveAllNotes, toggleEdit };
})();

document.addEventListener("DOMContentLoaded", () => {
  Dashboard.init();
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    document.getElementById("error-msg").classList.add("hidden");
    const sel=document.getElementById("week-select");
    await API.refresh(sel.options[sel.selectedIndex]?.textContent||"");
    Dashboard.loadWeek();
  });
});
