const Dashboard=(()=>{
  let weeks=[],curIdx=-1,curName="",isDateMode=false;
  let trendChart=null,revChart=null,bgChart=null;
  const fmt=n=>{if(n==null)return"—";if(n>=1e6)return"$"+(n/1e6).toFixed(1)+"M";if(n>=1e3)return"$"+(n/1e3).toFixed(1)+"K";return"$"+n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})};
  const fN=n=>{if(n==null)return"—";if(n>=1e6)return(n/1e6).toFixed(1)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return n.toLocaleString()};
  const fP=n=>n!=null?n.toFixed(1)+"%":"—";
  const fD=(c,p)=>{if(c==null||p==null||p===0)return"";const d=((c-p)/p)*100;return`<span class="${d>=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>`};
  const fDI=(c,p)=>{if(c==null||p==null||p===0)return"";const d=((c-p)/p)*100;return`<span class="${d<=0?"delta-up":"delta-down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>`};
  const esc=s=>{const d=document.createElement("div");d.textContent=s;return d.innerHTML};

  async function init(){
    showLoading("Connecting...");
    try{
      const resp=await API.getWeeks();if(resp.error)throw new Error(resp.error);
      weeks=resp.weeks||[];if(!weeks.length){showError("No week folders.");return}
      document.getElementById("brand-title").textContent=resp.brand||"Dashboard";
      const sel=document.getElementById("week-select");sel.innerHTML="";
      weeks.forEach((w,i)=>{const o=document.createElement("option");o.value=i;o.textContent=w;sel.appendChild(o)});
      curIdx=weeks.length-1;sel.value=curIdx;
      sel.addEventListener("change",()=>{curIdx=parseInt(sel.value);isDateMode=false;loadWeek()});
      // Date range toggle
      document.getElementById("btn-date-mode").addEventListener("click",toggleDateMode);
      document.getElementById("btn-date-go").addEventListener("click",loadDateRange);
      initTabs();await loadWeek();
    }catch(e){showError("Error: "+e.message)}
  }

  function toggleDateMode(){
    isDateMode=!isDateMode;
    document.getElementById("week-select").style.display=isDateMode?"none":"";
    document.getElementById("date-range-inputs").style.display=isDateMode?"flex":"none";
    document.getElementById("btn-date-mode").textContent=isDateMode?"← Weeks":"📅 Date Range";
  }

  async function loadDateRange(){
    const s=document.getElementById("date-start").value,e=document.getElementById("date-end").value;
    if(!s||!e){alert("Select both dates");return}
    showLoading("Loading date range...");
    try{const data=await API.getDateRange(s,e);if(data.error)throw new Error(data.error);render(data.cur,data.prev);hideLoading()}
    catch(err){showError("Error: "+err.message)}
  }

  async function loadWeek(){
    curName=weeks[curIdx];showLoading("Loading "+curName+"...");
    try{const data=await API.getWeekData(curName);if(data.error)throw new Error(data.error);render(data.cur,data.prev);hideLoading();API.getTrend().then(renderTrend).catch(()=>{})}
    catch(e){showError("Error: "+e.message)}
  }

  function render(d,p){
    if(!d)return;
    const dr=d.dateRange?" · "+d.dateRange:"";
    document.getElementById("week-label").textContent=(d.label||"")+" Ad Performance"+(p?" (vs "+p.label+")":"")+dr;
    setKPI("kpi-sales",fmt(d.sales),p?fD(d.sales,p.sales):"",p?p.label+": "+fmt(p.sales):"");
    setKPI("kpi-spend",fmt(d.spend),p?fD(d.spend,p.spend):"",p?p.label+": "+fmt(p.spend):"");
    setKPI("kpi-roas",d.roas?d.roas.toFixed(2):"—",p?fD(d.roas,p.roas):"",p?p.label+": "+p.roas:"");
    setKPI("kpi-acos",fP(d.acos),p?fDI(d.acos,p.acos):"",p?p.label+": "+fP(p.acos):"");
    setKPI("kpi-orders",fN(d.orders),p?fD(d.orders,p.orders):"",p?p.label+": "+fN(p.orders):"");
    setKPI("kpi-clicks",fN(d.clicks),p?fD(d.clicks,p.clicks):"",p?p.label+": "+fN(p.clicks):"");
    setKPI("kpi-imp",fN(d.imp),p?fD(d.imp,p.imp):"",p?p.label+": "+fN(p.imp):"");
    setKPI("kpi-cvr",fP(d.cvr),p?fD(d.cvr,p.cvr):"",p?p.label+": "+fP(p.cvr):"");
    const biz=d.business||{};
    document.getElementById("biz-revenue").textContent=fmt(biz.revenue||0);document.getElementById("biz-orders").textContent=fN(biz.totalOrders||0);document.getElementById("biz-sessions").textContent=fN(biz.sessions||0);document.getElementById("biz-buybox").textContent=fP(biz.avgBuyBox||0);
    renderRevSplit(d.sales||0,biz.revenue?Math.max(0,biz.revenue-(d.sales||0)):0);
    const bc=d.brandCampaigns||{},gc=d.genericCampaigns||{};renderBrandGen(bc.sales||0,gc.sales||0);
    document.getElementById("brand-roas").textContent=bc.roas||"—";document.getElementById("brand-spend").textContent=fmt(bc.spend);document.getElementById("brand-sales2").textContent=fmt(bc.sales);document.getElementById("brand-acos").textContent=fP(bc.acos);
    document.getElementById("generic-roas").textContent=gc.roas||"—";document.getElementById("generic-spend").textContent=fmt(gc.spend);document.getElementById("generic-sales2").textContent=fmt(gc.sales);document.getElementById("generic-acos").textContent=fP(gc.acos);
    renderFunnel(d.funnel);renderMTD(d.mtd);renderSearchTerms(d.searchTermsTop,d.searchTermsLow,d.searchTermsOpp);renderProducts(d.products,p?p.products:null);
    const auto=genSummary(d,p),txt=d.savedSummary||auto;
    document.getElementById("summary-display").innerHTML=txt.split("\n").map(l=>"<p>"+l+"</p>").join("");document.getElementById("summary-edit").value=txt;
    const autoRecs=(d.autoRecs||[]).map(r=>r.level+" — "+r.text).join("\n");const recsText=d.savedRecs||autoRecs;
    document.getElementById("recs-display").innerHTML=recsText?fmtRecs(recsText):'<p class="text-muted">No recommendations.</p>';document.getElementById("recs-edit").value=recsText;
  }

  function genSummary(d,p){const l=[];if(d.sales&&d.spend){const sd=p&&p.sales?((d.sales-p.sales)/p.sales*100).toFixed(1):null;const tr=sd!==null?(Math.abs(sd)<3?"held roughly flat":(sd>0?"grew "+sd+"%":"declined "+Math.abs(sd)+"%")):"";l.push("Sales "+tr+" WoW at "+fmt(d.sales)+" on "+fmt(d.spend)+" in spend; ROAS moved to "+d.roas+" (ACOS "+fP(d.acos)+").")}if(d.imp&&p&&p.imp){l.push("Top of funnel: impressions "+((d.imp-p.imp)/p.imp*100).toFixed(0)+"% and clicks "+(p.clicks?((d.clicks-p.clicks)/p.clicks*100).toFixed(0):0)+"%, CPC at ~"+fmt(d.cpc)+".")}const bc=d.brandCampaigns||{},gc=d.genericCampaigns||{};if(bc.spend&&gc.spend)l.push("Branded: "+(bc.spend/d.spend*100).toFixed(0)+"% of spend → "+(bc.sales/d.sales*100).toFixed(0)+"% of sales; non-brand ROAS at "+gc.roas+"x.");if(d.ntbOrders>0)l.push(fN(d.orders)+" orders, "+d.ntbOrders+" new-to-brand ("+fmt(d.ntbSales)+" incremental).");return l.join("\n")}
  function fmtRecs(text){return text.split("\n").filter(l=>l.trim()).map(line=>{let badge="",content=line;const m=line.match(/^(HIGH|MED|LOW)\s*[:\-–—]?\s*(.*)/i);if(m){badge='<span class="rec-badge '+m[1].toLowerCase()+'">'+m[1].toUpperCase()+'</span>';content=m[2]}return'<div class="rec-item">'+badge+'<span class="rec-text">'+esc(content)+'</span></div>'}).join("")}
  function setKPI(id,v,d,s){const el=document.getElementById(id);if(!el)return;el.querySelector(".kpi-value").innerHTML=v;el.querySelector(".kpi-delta").innerHTML=d;const sub=el.querySelector(".kpi-sub");if(sub)sub.textContent=s||""}

  // ── Trapezoid Funnel SVG ───────────────────────────
  function renderFunnel(f){
    const sec=document.getElementById("funnel-section");if(!f){sec.style.display="none";return}sec.style.display="";
    const W=600,H=300,cx=W/2;
    const stages=[
      {label:"IMPRESSIONS",value:fN(f.impressions),w1:480,w2:340,grad:["#3A55FF","#009BFF"]},
      {label:"CLICKS",value:fN(f.clicks),w1:340,w2:200,grad:["#0096FA","#84C9F7"]},
      {label:"ORDERS",value:fN(f.orders),w1:200,w2:120,grad:["#770BFF","#3A55FF"]}
    ];
    const rates=[{label:"CTR",value:fP(f.ctr)},{label:"CVR",value:fP(f.cvr)}];
    const stageH=65,gapH=35,startY=10;

    let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    // Defs
    svg+='<defs>';
    stages.forEach((s,i)=>{svg+=`<linearGradient id="sf${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.grad[0]}"/><stop offset="100%" stop-color="${s.grad[1]}"/></linearGradient>`});
    svg+='</defs>';

    stages.forEach((s,i)=>{
      const y=startY+i*(stageH+gapH);
      const tw=s.w1/2,bw=s.w2/2; // half-widths
      // Trapezoid: top-left, top-right, bottom-right, bottom-left
      const tl=cx-tw,tr=cx+tw,bl=cx-bw,br=cx+bw;
      const by=y+stageH;
      svg+=`<path d="M${tl} ${y} L${tr} ${y} L${br} ${by} L${bl} ${by} Z" fill="url(#sf${i})" opacity="0.85"/>`;
      // Stage label + value (centered)
      svg+=`<text x="${cx}" y="${y+25}" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Inter,sans-serif" font-weight="600" text-anchor="middle" letter-spacing="1.5">${s.label}</text>`;
      svg+=`<text x="${cx}" y="${y+48}" fill="#fff" font-size="22" font-family="Inconsolata,monospace" font-weight="700" text-anchor="middle">${s.value}</text>`;
      // Rate between this and next stage
      if(i<rates.length){
        const ry=by+gapH/2+5;
        svg+=`<text x="${cx}" y="${ry}" fill="#0096FA" font-size="13" font-family="Inconsolata,monospace" font-weight="600" text-anchor="middle">${rates[i].label} ${rates[i].value}</text>`;
        // Small arrow
        svg+=`<path d="M${cx-4} ${ry+6} L${cx} ${ry+12} L${cx+4} ${ry+6}" fill="none" stroke="#7A8BA3" stroke-width="1.5"/>`;
      }
    });
    svg+='</svg>';
    document.getElementById("funnel-svg").innerHTML=svg;
  }

  // ── Charts ─────────────────────────────────────────
  function renderTrend(data){if(!data||!data.weeks)return;const c=document.getElementById("trend-chart");if(!c)return;const labels=data.weekOrder||Object.keys(data.weeks);const sd=labels.map(l=>data.weeks[l]?data.weeks[l].sales:null);if(trendChart)trendChart.destroy();trendChart=new Chart(c,{type:"line",data:{labels,datasets:[{label:"Ad Sales",data:sd,borderColor:"#0096FA",backgroundColor:"rgba(0,150,250,0.08)",fill:true,tension:.3,pointRadius:5,pointBackgroundColor:"#0096FA"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#C4D3E3"},grid:{color:"rgba(255,255,255,0.04)"}},y:{ticks:{color:"#C4D3E3",callback:v=>"$"+(v>=1000?(v/1000).toFixed(0)+"K":v)},grid:{color:"rgba(255,255,255,0.04)"}}}}})};
  function renderRevSplit(a,o){const c=document.getElementById("rev-split-chart");if(!c)return;if(revChart)revChart.destroy();revChart=new Chart(c,{type:"doughnut",data:{labels:["Ad Sales","Organic"],datasets:[{data:[a,o],backgroundColor:["#3A55FF","#770BFF"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#C4D3E3",padding:16,usePointStyle:true}}}}})};
  function renderBrandGen(b,g){const c=document.getElementById("brand-gen-chart");if(!c)return;if(bgChart)bgChart.destroy();bgChart=new Chart(c,{type:"doughnut",data:{labels:["Brand","Generic"],datasets:[{data:[b,g],backgroundColor:["#0096FA","#770BFF"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:"#C4D3E3",padding:16,usePointStyle:true}}}}})};

  // ── Tabs ───────────────────────────────────────────
  function initTabs(){document.querySelectorAll(".tab-btn").forEach(btn=>{btn.addEventListener("click",()=>{const g=btn.closest(".tab-group");g.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));g.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));btn.classList.add("active");g.querySelector("#"+btn.dataset.tab).classList.add("active")})})}

  // ── Tables ─────────────────────────────────────────
  function renderSearchTerms(top,low,opp){
    const tb=document.getElementById("st-top-body");tb.innerHTML="";if(top&&top.length)top.forEach(t=>{tb.innerHTML+='<tr><td>'+esc(t.term)+'</td><td>'+fmt(t.sales)+'</td><td>'+fmt(t.spend)+'</td><td class="'+(t.roas>=5?'text-green':t.roas>=3?'text-yellow':'text-red')+'">'+t.roas+'</td><td>'+t.orders+'</td><td>'+fN(t.clicks)+'</td></tr>'});else tb.innerHTML='<tr><td colspan="6" class="text-muted">No data</td></tr>';
    const lb=document.getElementById("st-low-body");lb.innerHTML="";if(low&&low.length)low.forEach(t=>{lb.innerHTML+='<tr><td>'+esc(t.term)+'</td><td class="text-red">'+fmt(t.spend)+'</td><td>'+t.clicks+'</td></tr>'});else lb.innerHTML='<tr><td colspan="3" class="text-muted">None</td></tr>';
    const ob=document.getElementById("st-opp-body");ob.innerHTML="";if(opp&&opp.length)opp.forEach(t=>{ob.innerHTML+='<tr><td>'+esc(t.term)+'</td><td>'+fmt(t.sales)+'</td><td>'+fmt(t.spend)+'</td><td class="text-green">'+t.roas+'</td></tr>'});else ob.innerHTML='<tr><td colspan="4" class="text-muted">None</td></tr>';
    const tc=document.getElementById("st-top-count");if(tc)tc.textContent=(top||[]).length;const lc=document.getElementById("st-low-count");if(lc)lc.textContent=(low||[]).length;const oc=document.getElementById("st-opp-count");if(oc)oc.textContent=(opp||[]).length;
  }
  function renderProducts(products,prev){
    const body=document.getElementById("prod-top-body");body.innerHTML="";if(!products||!products.length){body.innerHTML='<tr><td colspan="5" class="text-muted">No data</td></tr>';return}
    const pm={};if(prev)prev.forEach(p=>{pm[p.asin]=p});
    products.slice(0,10).forEach(p=>{body.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(p.spend)+'</td><td class="'+(p.roas>=5?'text-green':p.roas>=3?'text-yellow':'text-red')+'">'+p.roas+'</td><td>'+p.orders+'</td></tr>'});
    const ab=document.getElementById("prod-acc-body"),db=document.getElementById("prod-dec-body");ab.innerHTML="";db.innerHTML="";let ac=0,dc=0;
    if(prev){products.forEach(p=>{const pr=pm[p.asin];if(!pr||pr.sales===0)return;const w=((p.sales-pr.sales)/pr.sales*100);if(w>=20){ac++;ab.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(pr.sales)+'</td><td class="text-green">+'+w.toFixed(1)+'%</td><td>'+p.roas+'</td><td>'+p.orders+'</td></tr>'}if(w<=-20){dc++;db.innerHTML+='<tr><td class="product-name">'+esc(p.title)+'</td><td>'+fmt(p.sales)+'</td><td>'+fmt(pr.sales)+'</td><td class="text-red">'+w.toFixed(1)+'%</td><td>'+p.roas+'</td><td>'+p.orders+'</td></tr>'}})}
    if(!ab.innerHTML)ab.innerHTML='<tr><td colspan="6" class="text-muted">None</td></tr>';if(!db.innerHTML)db.innerHTML='<tr><td colspan="6" class="text-muted">None</td></tr>';
    const acc=document.getElementById("prod-acc-count");if(acc)acc.textContent=ac;const dcc=document.getElementById("prod-dec-count");if(dcc)dcc.textContent=dc;
  }
  function renderMTD(mtd){const sec=document.getElementById("mtd-section");if(!mtd){sec.style.display="none";return}sec.style.display="";document.getElementById("mtd-day").textContent=mtd.day;document.getElementById("mtd-days").textContent=mtd.monthDays;document.getElementById("mtd-spend-val").textContent=fmt(mtd.mtdSpend);document.getElementById("mtd-spend-target").textContent=fmt(mtd.spendForecast);document.getElementById("mtd-spend-bar").style.width=Math.min(mtd.spendPct,100)+"%";const sd=mtd.spendPct-(mtd.day/mtd.monthDays*100);const sn=document.getElementById("mtd-spend-note");sn.textContent=(sd>=0?"▲ ":"▼ ")+Math.abs(sd).toFixed(1)+"% "+(sd>=0?"ahead":"behind");sn.className="mtd-bar-note "+(sd>=0?"text-green":"text-red");document.getElementById("mtd-rev-val").textContent=fmt(mtd.mtdSales);document.getElementById("mtd-rev-target").textContent=fmt(mtd.salesForecast);document.getElementById("mtd-rev-bar").style.width=Math.min(mtd.salesPct,100)+"%";const rd=mtd.salesPct-(mtd.day/mtd.monthDays*100);const rn=document.getElementById("mtd-rev-note");rn.textContent=(rd>=0?"▲ ":"▼ ")+Math.abs(rd).toFixed(1)+"% "+(rd>=0?"ahead":"behind");rn.className="mtd-bar-note "+(rd>=0?"text-green":"text-red");document.getElementById("mtd-roas").textContent=mtd.roasMtd;document.getElementById("mtd-roas-target").textContent=mtd.roasTarget}

  async function saveAllNotes(){const s=document.getElementById("summary-edit").value,r=document.getElementById("recs-edit").value;try{await API.saveNotes(curName,s,r);document.getElementById("summary-display").innerHTML=s.split("\n").map(l=>"<p>"+l+"</p>").join("");document.getElementById("recs-display").innerHTML=r?fmtRecs(r):'<p class="text-muted">No recommendations.</p>';toggleEdit("summary",false);toggleEdit("recs",false)}catch(e){alert("Save failed")}}
  function toggleEdit(sec,show){const d=document.getElementById(sec+"-display"),e=document.getElementById(sec+"-edit"),bE=document.getElementById(sec+"-btn-edit"),bS=document.getElementById(sec+"-btn-save"),bC=document.getElementById(sec+"-btn-cancel");if(show){d.style.display="none";e.style.display="block";bE.style.display="none";bS.style.display="inline";bC.style.display="inline"}else{d.style.display="";e.style.display="none";bE.style.display="inline";bS.style.display="none";bC.style.display="none"}}
  function showLoading(m){const el=document.getElementById("loading-overlay");if(el){el.querySelector(".loading-text").textContent=m;el.classList.remove("hidden")}}
  function hideLoading(){const el=document.getElementById("loading-overlay");if(el)el.classList.add("hidden")}
  function showError(m){hideLoading();const el=document.getElementById("error-msg");if(el){el.textContent=m;el.classList.remove("hidden")}}
  return{init,loadWeek,saveAllNotes,toggleEdit};
})();
document.addEventListener("DOMContentLoaded",()=>{Dashboard.init();document.getElementById("btn-refresh").addEventListener("click",async()=>{document.getElementById("error-msg").classList.add("hidden");const sel=document.getElementById("week-select");await API.refresh(sel.options[sel.selectedIndex]?.textContent||"");Dashboard.loadWeek()})});
