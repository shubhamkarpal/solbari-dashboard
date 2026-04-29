/**
 * Pattern Weekly Dashboard — API v7
 * Date range support: use as weekly OR monthly dashboard.
 * Single combined CSV + Business Report per week folder.
 */

var BRAND_NAME = "Solbari";
var BRAND_FOLDER_ID = "1zFv9PXv_qxBcPJCwMGcjpP6zZ6cfXb2A";
var BRAND_KEYWORDS = ["solbari"];
var CACHE_TTL = 3600;
var MTD_SHEET_ID = "YOUR_MTD_TRACKER_SHEET_ID_HERE";
var MTD_SHEET_TAB = "Apr 2026";

function doGet(e) {
  var action = (e.parameter.action || "").toLowerCase(), result;
  try {
    switch (action) {
      case "weeks":     result = { weeks: getWeekList(), brand: BRAND_NAME }; break;
      case "week":      result = loadWeekPair(e.parameter.week || ""); break;
      case "daterange": result = loadDateRange(e.parameter.start || "", e.parameter.end || ""); break;
      case "trend":     result = getAllWeeksSummary(); break;
      case "refresh":   clearAllCache(); result = e.parameter.week ? loadWeekPair(e.parameter.week) : { weeks: getWeekList(), brand: BRAND_NAME }; break;
      case "debug":     result = debugWeek(e.parameter.week || ""); break;
      case "getnotes":  result = getNotes(e.parameter.week || ""); break;
      case "savenotes": result = saveNotes(e.parameter.week || "", e.parameter.summary || "", e.parameter.recs || ""); break;
      default:          result = { error: "Unknown action" };
    }
  } catch (err) { result = { error: err.toString(), stack: err.stack }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ── Notes ────────────────────────────────────────────
function getNotes(wk) { var p=PropertiesService.getScriptProperties(); return{week:wk,summary:p.getProperty("s_"+wk)||"",recs:p.getProperty("r_"+wk)||""}; }
function saveNotes(wk,s,r) { var p=PropertiesService.getScriptProperties();p.setProperty("s_"+wk,s);p.setProperty("r_"+wk,r);return{ok:true}; }

// ── Debug ────────────────────────────────────────────
function testDebug() { Logger.log(JSON.stringify(debugWeek(""),null,2)); }
function debugWeek(weekName) {
  var info={brand:BRAND_NAME,files:[],errors:[]};
  try{var bf=getBrandFolder();info.brandFolder=bf.getName();info.allWeeks=getWeekList();if(!weekName)weekName=info.allWeeks[info.allWeeks.length-1];info.weekName=weekName;
  var wfs=bf.getFoldersByName(weekName);if(!wfs.hasNext()){info.errors.push("Folder not found");return info}var files=wfs.next().getFiles();
  while(files.hasNext()){var f=files.next();var fi={name:f.getName(),size:f.getSize()};var nm=f.getName().toLowerCase();
    if(nm.indexOf(".csv")>=0){var txt=f.getBlob().getDataAsString();var hdr=txt.split("\n")[0].toLowerCase().replace(/^\ufeff/,"");fi.rows=txt.split("\n").length;
      if(hdr.indexOf("search term")>=0&&hdr.indexOf("advertised product")>=0)fi.type="Combined Report";
      else if(hdr.indexOf("asin")>=0&&(hdr.indexOf("session")>=0||hdr.indexOf("ordered product")>=0))fi.type="Business Report";
      else if(hdr.indexOf("date")>=0&&hdr.indexOf("campaign")>=0)fi.type="Campaign Only";
      else fi.type="Unknown";fi.status="OK"}else{fi.type="Skipped";fi.status="SKIPPED"}info.files.push(fi)}
  }catch(e){info.errors.push(e.toString())}return info;
}

// ── Folders / Cache ──────────────────────────────────
function getBrandFolder(){var f=DriveApp.getFolderById(BRAND_FOLDER_ID);var subs=f.getFolders();if(subs.hasNext()){var fn=subs.next().getName().toLowerCase();if(fn.indexOf("week")<0&&fn.indexOf("wk")<0&&!/^\d/.test(fn)){var bs=f.getFoldersByName(BRAND_NAME);if(bs.hasNext())return bs.next();var all=f.getFolders();while(all.hasNext()){var s=all.next();if(s.getName().toLowerCase().trim()===BRAND_NAME.toLowerCase().trim())return s}}}return f}
function getWeekList(){var f=getBrandFolder(),subs=f.getFolders(),w=[];while(subs.hasNext())w.push(subs.next().getName());return w.sort(function(a,b){var na=parseInt(a.replace(/\D/g,"")),nb=parseInt(b.replace(/\D/g,""));return(!isNaN(na)&&!isNaN(nb))?na-nb:a.localeCompare(b)})}
function gc(k){try{return JSON.parse(CacheService.getScriptCache().get(k))}catch(e){return null}}
function sc(k,v){try{var s=JSON.stringify(v);if(s.length<100000)CacheService.getScriptCache().put(k,s,CACHE_TTL)}catch(e){}}
function clearAllCache(){try{var c=CacheService.getScriptCache();c.removeAll(getWeekList().map(function(w){return"wk_"+w}));c.remove("trend")}catch(e){}}

// ── MTD ──────────────────────────────────────────────
function getMTDData(){try{if(!MTD_SHEET_ID||MTD_SHEET_ID==="YOUR_MTD_TRACKER_SHEET_ID_HERE")return null;var ss=SpreadsheetApp.openById(MTD_SHEET_ID),sh=ss.getSheetByName(MTD_SHEET_TAB);if(!sh)return null;var d=sh.getDataRange().getValues();for(var i=2;i<d.length;i++){if(S(d[i][0]).toLowerCase().indexOf(BRAND_NAME.toLowerCase())>=0){var sf=N(d[i][3]),ms=N(d[i][6]),saf=N(d[i][11]),mas=N(d[i][14]),day=N(d[0][21])||1,md=N(d[0][23])||30;return{spendForecast:sf,mtdSpend:ms,salesForecast:saf,mtdSales:mas,spendPct:sf>0?R(ms/sf*100,1):0,salesPct:saf>0?R(mas/saf*100,1):0,roasTarget:sf>0?R(saf/sf):0,day:day,monthDays:md,roasMtd:ms>0?R(mas/ms):0}}}return null}catch(e){return null}}

// ═══════════════════════════════════════════════════════
// WEEK LOADER
// ═══════════════════════════════════════════════════════

function loadWeekPair(weekName){
  var weeks=getWeekList(),idx=weeks.indexOf(weekName);
  var cur=gc("wk_"+weekName);if(!cur){cur=getWeekData(weekName);sc("wk_"+weekName,cur)}
  var prev=null;if(idx>0){var pw=weeks[idx-1];prev=gc("wk_"+pw);if(!prev){prev=getWeekData(pw);sc("wk_"+pw,prev)}}
  cur.mtd=getMTDData();var notes=getNotes(weekName);cur.savedSummary=notes.summary;cur.savedRecs=notes.recs;
  cur.autoRecs=generateRecommendations(cur,prev);
  return{brand:BRAND_NAME,weekOrder:weeks,cur:cur,prev:prev};
}

function getAllWeeksSummary(){var cached=gc("trend");if(cached)return cached;var weeks=getWeekList(),result={};weeks.forEach(function(w){var wc=gc("wk_"+w);if(wc&&wc.sales){result[w]={spend:wc.spend,sales:wc.sales,clicks:wc.clicks,orders:wc.orders,roas:wc.roas};return}try{var d=getWeekData(w);if(d.sales)result[w]={spend:d.spend,sales:d.sales,clicks:d.clicks,orders:d.orders,roas:d.roas};sc("wk_"+w,d)}catch(e){}});var out={weekOrder:weeks,weeks:result};sc("trend",out);return out}

// ═══════════════════════════════════════════════════════
// DATE RANGE LOADER — reads ALL weeks, filters by date
// ═══════════════════════════════════════════════════════

function loadDateRange(startStr, endStr) {
  var startDate = new Date(startStr), endDate = new Date(endStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return { error: "Invalid dates" };

  var bf = getBrandFolder(), weeks = getWeekList();
  var allCombinedRows = [], allHeaders = null, biz = null;

  // Read combined CSVs from all week folders
  for (var w = 0; w < weeks.length; w++) {
    var wfs = bf.getFoldersByName(weeks[w]);
    if (!wfs.hasNext()) continue;
    var files = wfs.next().getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().toLowerCase().indexOf(".csv") < 0) continue;
      var txt = f.getBlob().getDataAsString();
      var hdr = txt.split("\n")[0].toLowerCase().replace(/^\ufeff/, "");
      if (hdr.indexOf("search term") >= 0 && hdr.indexOf("advertised product") >= 0) {
        var rows = Utilities.parseCsv(txt);
        if (!allHeaders) allHeaders = rows[0];
        for (var i = 1; i < rows.length; i++) allCombinedRows.push(rows[i]);
      } else if (hdr.indexOf("asin") >= 0 && (hdr.indexOf("session") >= 0 || hdr.indexOf("ordered product") >= 0)) {
        if (!biz) biz = parseBusinessCSV(txt);
      }
    }
  }

  if (!allHeaders || allCombinedRows.length === 0) return { error: "No combined CSV data found" };

  // Filter rows by date range
  var h = allHeaders.map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var iDate = fi(h, function(x) { return x.indexOf("date") >= 0; });
  var filtered = [];
  for (var i = 0; i < allCombinedRows.length; i++) {
    var dateVal = S(allCombinedRows[i][iDate]);
    if (!dateVal) continue;
    var rowDate = new Date(dateVal);
    if (!isNaN(rowDate.getTime()) && rowDate >= startDate && rowDate <= endDate) {
      filtered.push(allCombinedRows[i]);
    }
  }

  // Parse filtered data using same logic
  var result = parseCombinedRows(allHeaders, filtered, biz);
  result.label = formatDateShort(startStr) + " – " + formatDateShort(endStr);
  result.dateRange = result.label;
  result.brand = BRAND_NAME;
  result.autoRecs = generateRecommendations(result, null);
  result.mtd = getMTDData();
  return { brand: BRAND_NAME, weekOrder: getWeekList(), cur: result, prev: null };
}

// ═══════════════════════════════════════════════════════
// WEEK DATA
// ═══════════════════════════════════════════════════════

function getWeekData(weekName) {
  var bf=getBrandFolder(),wfs=bf.getFoldersByName(weekName);if(!wfs.hasNext())return{error:"Week not found"};
  var wf=wfs.next(),files=wf.getFiles(),combined=null,biz=null,campOnly=null;
  while(files.hasNext()){var f=files.next();if(f.getName().toLowerCase().indexOf(".csv")<0)continue;var txt=f.getBlob().getDataAsString();var hdr=txt.split("\n")[0].toLowerCase().replace(/^\ufeff/,"");
    if(hdr.indexOf("search term")>=0&&hdr.indexOf("advertised product")>=0)combined=txt;
    else if(hdr.indexOf("asin")>=0&&(hdr.indexOf("session")>=0||hdr.indexOf("ordered product")>=0))biz=parseBusinessCSV(txt);
    else if(hdr.indexOf("date")>=0&&hdr.indexOf("campaign")>=0)campOnly=txt}
  var r={label:weekName,brand:BRAND_NAME};
  if(combined){var rows=Utilities.parseCsv(combined);r=mergeObj(r,parseCombinedRows(rows[0],rows.slice(1),biz))}
  else if(campOnly)r=mergeObj(r,parseCampaignRows(campOnly));
  if(biz)r.business={sessions:biz.sessions,revenue:biz.revenue,units:biz.units,totalOrders:biz.totalOrders,pageViews:biz.pageViews,avgBuyBox:biz.avgBuyBox,convRate:biz.convRate};
  return r;
}

// ═══════════════════════════════════════════════════════
// COMBINED ROW PARSER (shared by week + daterange)
// ═══════════════════════════════════════════════════════

function parseCombinedRows(headers, dataRows, biz) {
  var h = headers.map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var col = function(k) { return fi(h, function(x) { return x.indexOf(k) >= 0; }); };
  var iDate=col("date"),iCamp=col("campaign name"),iAsin=col("advertised product id"),iST=col("search term");
  var iImp=col("impressions"),iClk=col("clicks"),iCost=col("total cost");
  var iSales=fi(h,function(x){return x==="sales"||x==="sales "});if(iSales<0)iSales=col("sales");
  var iOrd=col("purchases"),iNTBo=col("purchases (new to brand)"),iNTBs=col("sales (new to brand)");

  var t={sp:0,sa:0,cl:0,im:0,od:0,no:0,ns:0,bs:0,ba:0,gs:0,ga:0};
  var terms={},prods={},dates=[];
  var titles=(biz&&biz.titles)||{};

  for(var i=0;i<dataRows.length;i++){var r=dataRows[i];
    var camp=S(r[iCamp]),asin=S(r[iAsin]),term=S(r[iST]);
    var imp=N(r[iImp]),clk=N(r[iClk]),cost=F(r[iCost]),sale=F(r[iSales]),ord=N(r[iOrd]);
    var ntbo=iNTBo>=0?N(r[iNTBo]):0,ntbs=iNTBs>=0?F(r[iNTBs]):0;
    if(iDate>=0&&r[iDate]){var ds=S(r[iDate]);if(ds&&dates.indexOf(ds)<0)dates.push(ds)}
    t.sp+=cost;t.sa+=sale;t.cl+=clk;t.im+=imp;t.od+=ord;t.no+=ntbo;t.ns+=ntbs;
    if(camp.toLowerCase().indexOf("brand")>=0){t.bs+=cost;t.ba+=sale}else{t.gs+=cost;t.ga+=sale}
    if(term){if(!terms[term])terms[term]={i:0,c:0,s:0,sa:0,o:0};terms[term].i+=imp;terms[term].c+=clk;terms[term].s+=cost;terms[term].sa+=sale;terms[term].o+=ord}
    if(asin){if(!prods[asin])prods[asin]={s:0,sa:0,o:0,c:0};prods[asin].s+=cost;prods[asin].sa+=sale;prods[asin].o+=ord;prods[asin].c+=clk}
  }

  dates.sort(function(a,b){return new Date(a)-new Date(b)});
  var dateRange=dates.length>0?formatDateShort(dates[0])+" – "+formatDateShort(dates[dates.length-1]):"";

  var result={spend:R(t.sp),sales:R(t.sa),clicks:t.cl,imp:t.im,orders:t.od,ntbOrders:t.no,ntbSales:R(t.ns),dateRange:dateRange,
    roas:t.sp>0?R(t.sa/t.sp):0,acos:t.sa>0?R(t.sp/t.sa*100,1):0,cpc:t.cl>0?R(t.sp/t.cl):0,ctr:t.im>0?R(t.cl/t.im*100):0,cvr:t.cl>0?R(t.od/t.cl*100,1):0,
    brandCampaigns:{spend:Math.round(t.bs),sales:Math.round(t.ba),roas:t.bs>0?R(t.ba/t.bs):0,acos:t.ba>0?R(t.bs/t.ba*100,1):0},
    genericCampaigns:{spend:Math.round(t.gs),sales:Math.round(t.ga),roas:t.gs>0?R(t.ga/t.gs):0,acos:t.ga>0?R(t.gs/t.ga*100,1):0},
    funnel:{impressions:t.im,clicks:t.cl,orders:t.od,ctr:t.im>0?R(t.cl/t.im*100):0,cvr:t.cl>0?R(t.od/t.cl*100,1):0}};

  var sorted=Object.entries(terms).sort(function(a,b){return b[1].sa-a[1].sa});
  result.searchTermsTop=sorted.slice(0,15).map(function(e){var k=e[0],d=e[1];return{term:k,sales:R(d.sa),spend:R(d.s),roas:d.s>0?R(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}});
  result.searchTermsLow=Object.entries(terms).filter(function(e){return e[1].s>=5&&e[1].sa===0&&e[1].c>=30}).sort(function(a,b){return b[1].s-a[1].s}).slice(0,15).map(function(e){return{term:e[0],spend:R(e[1].s),clicks:Math.round(e[1].c)}});
  result.searchTermsOpp=Object.entries(terms).filter(function(e){var k=e[0],d=e[1];return d.s>0&&d.sa>0&&d.sa/d.s>5&&!BRAND_KEYWORDS.some(function(bk){return k.toLowerCase().indexOf(bk)>=0})}).sort(function(a,b){return(b[1].sa/b[1].s)-(a[1].sa/a[1].s)}).slice(0,10).map(function(e){var k=e[0],d=e[1];return{term:k,sales:R(d.sa),spend:R(d.s),roas:R(d.sa/d.s,1)}});
  result.products=Object.entries(prods).sort(function(a,b){return b[1].sa-a[1].sa}).slice(0,20).map(function(e){var a=e[0],d=e[1];return{asin:a,title:shortenTitle(titles[a]||a),sales:R(d.sa),spend:R(d.s),roas:d.s>0?R(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}});
  return result;
}

// ── Campaign fallback ────────────────────────────────
function parseCampaignRows(txt){var rows=Utilities.parseCsv(txt);if(rows.length<2)return{};var h=rows[0].map(function(x){return x.toLowerCase().trim().replace(/^\ufeff/,"")});var col=function(k){return fi(h,function(x){return x.indexOf(k)>=0})};var iD=col("date"),iC=col("campaign name"),iI=col("impressions"),iK=col("clicks"),iCo=col("total cost"),iO=col("purchases");var iS=fi(h,function(x){return x==="sales"||x==="sales "});var iNO=col("purchases (new to brand)"),iNS=col("sales (new to brand)");if(iS<0)return{};var sp=0,sa=0,cl=0,im=0,od=0,no=0,ns=0,bs=0,ba=0,gs=0,ga=0;for(var i=1;i<rows.length;i++){var r=rows[i];if(!r[iD])continue;sp+=F(r[iCo]);sa+=F(r[iS]);cl+=N(r[iK]);im+=N(r[iI]);od+=N(r[iO]);no+=iNO>=0?N(r[iNO]):0;ns+=iNS>=0?F(r[iNS]):0;if(S(r[iC]).toLowerCase().indexOf("brand")>=0){bs+=F(r[iCo]);ba+=F(r[iS])}else{gs+=F(r[iCo]);ga+=F(r[iS])}}return{spend:R(sp),sales:R(sa),clicks:cl,imp:im,orders:od,ntbOrders:no,ntbSales:R(ns),roas:sp>0?R(sa/sp):0,acos:sa>0?R(sp/sa*100,1):0,cpc:cl>0?R(sp/cl):0,ctr:im>0?R(cl/im*100):0,cvr:cl>0?R(od/cl*100,1):0,brandCampaigns:{spend:Math.round(bs),sales:Math.round(ba),roas:bs>0?R(ba/bs):0,acos:ba>0?R(bs/ba*100,1):0},genericCampaigns:{spend:Math.round(gs),sales:Math.round(ga),roas:gs>0?R(ga/gs):0,acos:ga>0?R(gs/ga*100,1):0},funnel:{impressions:im,clicks:cl,orders:od,ctr:im>0?R(cl/im*100):0,cvr:cl>0?R(od/cl*100,1):0}}}

// ── Business Report ──────────────────────────────────
function parseBusinessCSV(c){var rows=Utilities.parseCsv(c);if(rows.length<2)return{sessions:0,revenue:0,units:0,totalOrders:0,pageViews:0,avgBuyBox:0,convRate:0,titles:{}};var h=rows[0].map(function(x){return x.toLowerCase().trim().replace(/^\ufeff/,"")});var iP=fi(h,function(x){return x.indexOf("(parent) asin")>=0}),iA=fi(h,function(x){return x.indexOf("(child) asin")>=0}),iT=fi(h,function(x){return x==="title"});var iS=fi(h,function(x){return x.indexOf("sessions")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});var iR=fi(h,function(x){return x.indexOf("ordered product sales")>=0&&x.indexOf("b2b")<0});var iU=fi(h,function(x){return x.indexOf("units ordered")>=0&&x.indexOf("b2b")<0});var iO=fi(h,function(x){return x.indexOf("total order items")>=0&&x.indexOf("b2b")<0});var iPV=fi(h,function(x){return x.indexOf("page views")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});var iBB=fi(h,function(x){return x.indexOf("featured offer")>=0&&x.indexOf("buy box")>=0&&x.indexOf("b2b")<0});var sess=0,rev=0,units=0,orders=0,pv=0,bbS=0,bbC=0,titles={};for(var i=1;i<rows.length;i++){var r=rows[i];if(iS>=0)sess+=N(r[iS]);if(iR>=0)rev+=F(r[iR]);if(iU>=0)units+=N(r[iU]);if(iO>=0)orders+=N(r[iO]);if(iPV>=0)pv+=N(r[iPV]);if(iBB>=0&&r[iBB]){var b=parseFloat(String(r[iBB]).replace(/[^0-9.]/g,""));if(b>0){bbS+=b;bbC++}}var title=iT>=0?String(r[iT]||"").trim():"";if(title){if(iA>=0&&r[iA])titles[String(r[iA]).trim()]=title;if(iP>=0&&r[iP]){var pa=String(r[iP]).trim();if(!titles[pa])titles[pa]=title}}}return{sessions:sess,revenue:R(rev),units:units,totalOrders:orders,pageViews:pv,avgBuyBox:bbC>0?R(bbS/bbC,1):0,convRate:sess>0?R(units/sess*100,1):0,titles:titles}}

// ── Auto Recommendations ─────────────────────────────
function generateRecommendations(cur, prev) {
  var recs = [];
  if (!cur || !cur.sales) return recs;
  var lowCount=(cur.searchTermsLow||[]).length,lowSpend=0;(cur.searchTermsLow||[]).forEach(function(t){lowSpend+=t.spend});
  if(lowCount>0)recs.push({level:"HIGH",text:lowCount+" search terms with 30+ clicks haven't converted ($"+R(lowSpend)+" wasted). Adding as negatives to redirect budget."});
  var gc=cur.genericCampaigns||{};if(gc.roas&&gc.roas>=3)recs.push({level:"HIGH",text:"Non-brand at "+gc.roas+"x ROAS — increasing daily budgets on top performers for more impression share."});
  var topOpp=(cur.searchTermsOpp||[])[0];if(topOpp&&topOpp.roas>=10)recs.push({level:"MED",text:"\""+topOpp.term+"\" at "+topOpp.roas+"x ROAS on $"+topOpp.spend+" spend — raising bids 15-20% to scale."});
  var hiEff=(cur.products||[]).filter(function(p){return p.roas>=8&&p.sales>=500});
  if(hiEff.length>0)recs.push({level:"MED",text:"Dedicated campaigns for: "+hiEff.slice(0,2).map(function(p){return p.title+" ("+p.roas+"x)"}).join("; ")+"."});
  if(cur.acos>25)recs.push({level:"HIGH",text:"ACOS at "+cur.acos+"% — reviewing bid strategy on underperformers."});
  if(cur.ntbOrders>0&&cur.orders>0){var ntbPct=R(cur.ntbOrders/cur.orders*100,1);if(ntbPct>50)recs.push({level:"LOW",text:"Strong acquisition: "+ntbPct+"% new-to-brand. Consider expanding generic keyword coverage."})}
  if(cur.cvr&&cur.cvr<5&&prev&&prev.cvr&&cur.cvr<prev.cvr)recs.push({level:"MED",text:"CVR dropped to "+cur.cvr+"% from "+prev.cvr+"%. Reviewing listing content and pricing."});
  recs.push({level:"LOW",text:"Evaluating ASIN-level competitor targeting across top category products."});
  return recs;
}

// ── Utilities ────────────────────────────────────────
function R(n,d){var m=Math.pow(10,d||2);return Math.round(n*m)/m}
function N(v){return parseInt(String(v||"0").replace(/[^0-9]/g,""))||0}
function F(v){return parseFloat(String(v||"0").replace(/[^0-9.\-]/g,""))||0}
function S(v){return String(v||"").trim()}
function fi(arr,fn){for(var i=0;i<arr.length;i++)if(fn(arr[i]))return i;return-1}
function mergeObj(a,b){for(var k in b)if(b.hasOwnProperty(k))a[k]=b[k];return a}
function formatDateShort(ds){try{var d=new Date(ds);if(isNaN(d.getTime()))return ds;return["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]+" "+d.getDate()}catch(e){return ds}}
function shortenTitle(t){if(!t)return"";t=t.replace(/^Solbari\s*/i,"").replace(/Women[\u2018\u2019\'']?s?\s*/i,"").replace(/Men[\u2018\u2019\'']?s?\s*/i,"");["UPF 50+","UPF50+","UPF 50","Packable ","UV Sun Protection ","UV Protection ","Sun Protective ","with Large Brim and Detachable Strap","with Full Coverage Brim","Adjustable Size","Adjustable Fit","Breathable ","Lightweight ","Ponytail Opening","Sun Protection ","for Women","for Men","Hat, ","Hats ","Hats,"].forEach(function(x){t=t.split(x).join("")});t=t.replace(/[\u2018\u2019\''],?\s*/g," ").replace(/\s{2,}/g," ").replace(/^[\s,\-]+|[\s,\-]+$/g,"");if(t.length>40){var parts=t.split(/ - | \u2013 |, /);if(parts.length>=2){var f=parts[0].trim(),l=parts[parts.length-1].trim();t=(f+" - "+l).length<=45?f+" - "+l:f}}return t.length>45?t.substring(0,42)+"...":t}
