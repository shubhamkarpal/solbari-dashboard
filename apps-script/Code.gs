/**
 * Pattern Weekly Dashboard — API Backend
 * ───────────────────────────────────────
 * Deploy this as a Google Apps Script Web App.
 *
 * REQUIRED: Enable Advanced Drive Service
 *   → In editor, click + next to "Services" → Add "Drive API"
 *
 * SETUP:
 * 1. Update BRAND_FOLDER_ID (line 20)
 * 2. Update MTD_SHEET_ID and MTD_SHEET_TAB if using MTD tracking (lines 23-24)
 * 3. Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
 * 4. Copy URL → paste into js/config.js
 */

const BRAND_NAME = "Solbari";
const BRAND_FOLDER_ID = "1zFv9PXv_qxBcPJCwMGcjpP6zZ6cfXb2A";
const BRAND_KEYWORDS = ["solbari"];
const CACHE_TTL = 3600;

// MTD Tracker — set these if you have a monthly tracker sheet
const MTD_SHEET_ID = "YOUR_MTD_TRACKER_SHEET_ID_HERE";
const MTD_SHEET_TAB = "Apr 2026";

// ═══════════════════════════════════════════════════════
// JSON API Endpoint
// ═══════════════════════════════════════════════════════

function doGet(e) {
  var action = (e.parameter.action || "").toLowerCase();
  var result;

  try {
    switch (action) {
      case "weeks":
        result = { weeks: getWeekList(), brand: BRAND_NAME };
        break;
      case "week":
        var weekName = e.parameter.week || "";
        result = loadWeekPair(weekName);
        break;
      case "trend":
        result = getAllWeeksSummary();
        break;
      case "refresh":
        clearAllCache();
        var wk = e.parameter.week || "";
        result = wk ? loadWeekPair(wk) : { weeks: getWeekList(), brand: BRAND_NAME };
        break;
      case "debug":
        result = debugWeek(e.parameter.week || "");
        break;
      default:
        result = { error: "Use ?action=weeks or ?action=week&week=Week 16 or ?action=trend or ?action=debug&week=Week 16" };
    }
  } catch (err) {
    result = { error: err.toString(), stack: err.stack };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════
// Debug — shows what files exist and what parsed
// ═══════════════════════════════════════════════════════

function debugWeek(weekName) {
  var info = { brand: BRAND_NAME, folderId: BRAND_FOLDER_ID, weekName: weekName, files: [], errors: [] };
  try {
    var bf = getBrandFolder();
    info.brandFolder = bf.getName();
    var weeks = getWeekList();
    info.allWeeks = weeks;
    if (!weekName) weekName = weeks[weeks.length - 1];
    info.weekName = weekName;

    var wfs = bf.getFoldersByName(weekName);
    if (!wfs.hasNext()) { info.errors.push("Week folder not found: " + weekName); return info; }
    var wf = wfs.next();
    var files = wf.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var fInfo = { name: f.getName(), size: f.getSize(), type: f.getMimeType() };
      var nm = f.getName().toLowerCase();
      try {
        if (nm.indexOf(".csv") >= 0) {
          var txt = f.getBlob().getDataAsString();
          var hdr = txt.split("\n")[0];
          fInfo.firstRow = hdr.substring(0, 200);
          fInfo.rowCount = txt.split("\n").length;
          var hdrL = hdr.toLowerCase();
          if (hdrL.indexOf("date") >= 0 && hdrL.indexOf("campaign") >= 0) {
            fInfo.detected = "Campaign CSV";
            var rows = parseCampaignCSV(txt);
            fInfo.parsedRows = rows.length;
          } else if (hdrL.indexOf("asin") >= 0 && (hdrL.indexOf("session") >= 0 || hdrL.indexOf("ordered product") >= 0)) {
            fInfo.detected = "Business CSV";
            var biz = parseBusinessCSV(txt);
            fInfo.parsedSessions = biz.sessions;
            fInfo.parsedTitles = Object.keys(biz.titles).length;
          } else {
            fInfo.detected = "Unknown CSV";
          }
          fInfo.status = "OK";
        } else if (nm.indexOf(".xlsx") >= 0) {
          fInfo.detected = "XLSX";
          try {
            var p = parseXLSX(f.getBlob());
            fInfo.headers = p.headers.slice(0, 5);
            fInfo.dataRows = p.rows.length;
            var hs = p.headers.map(function(h) { return h.toLowerCase(); });
            if (hs.some(function(h) { return h.indexOf("customer search term") >= 0; })) {
              fInfo.detected = "Search Term XLSX";
              var st = processSearchTerms(p);
              fInfo.topTerms = st.top.length;
              fInfo.lowTerms = st.low.length;
              fInfo.oppTerms = st.opp.length;
            } else if (hs.some(function(h) { return h.indexOf("advertised asin") >= 0 || h.indexOf("advertised sku") >= 0; })) {
              fInfo.detected = "Product XLSX";
              var pr = processProducts(p, null);
              fInfo.productsFound = pr.length;
            }
            fInfo.status = "OK";
          } catch (xlsxErr) {
            fInfo.status = "XLSX_PARSE_ERROR";
            fInfo.error = xlsxErr.toString();
            info.errors.push("XLSX parse failed for " + f.getName() + ": " + xlsxErr.toString());
          }
        }
      } catch (fileErr) {
        fInfo.status = "ERROR";
        fInfo.error = fileErr.toString();
        info.errors.push(f.getName() + ": " + fileErr.toString());
      }
      info.files.push(fInfo);
    }

    // Check Drive Advanced Service
    try {
      info.driveServiceEnabled = typeof Drive !== "undefined" && typeof Drive.Files !== "undefined";
    } catch(e) {
      info.driveServiceEnabled = false;
      info.errors.push("Drive Advanced Service NOT enabled. Go to Services → Add Drive API");
    }

  } catch (e) {
    info.errors.push("Top-level: " + e.toString());
  }
  return info;
}

// ═══════════════════════════════════════════════════════
// Core Logic
// ═══════════════════════════════════════════════════════

function gc(k) { try { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch(e) { return null; } }
function sc(k, v) { try { var s = JSON.stringify(v); if (s.length < 100000) CacheService.getScriptCache().put(k, s, CACHE_TTL); } catch(e) {} }
function clearAllCache() { try { var c = CacheService.getScriptCache(); c.removeAll(getWeekList().map(function(w) { return "wk_" + w; })); c.remove("trend"); } catch(e) {} }

function getBrandFolder() {
  var f = DriveApp.getFolderById(BRAND_FOLDER_ID);
  var subs = f.getFolders();
  if (subs.hasNext()) {
    var fn = subs.next().getName().toLowerCase();
    if (fn.indexOf("week") < 0 && fn.indexOf("wk") < 0 && !/^\d/.test(fn)) {
      var bs = f.getFoldersByName(BRAND_NAME);
      if (bs.hasNext()) return bs.next();
      var all = f.getFolders();
      while (all.hasNext()) { var s = all.next(); if (s.getName().toLowerCase().trim() === BRAND_NAME.toLowerCase().trim()) return s; }
    }
  }
  return f;
}

function getWeekList() {
  var f = getBrandFolder(), subs = f.getFolders(), w = [];
  while (subs.hasNext()) w.push(subs.next().getName());
  return w.sort(function(a, b) { var na = parseInt(a.replace(/\D/g, "")), nb = parseInt(b.replace(/\D/g, "")); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b); });
}

function getMTDData() {
  try {
    if (!MTD_SHEET_ID || MTD_SHEET_ID === "YOUR_MTD_TRACKER_SHEET_ID_HERE") return null;
    var ss = SpreadsheetApp.openById(MTD_SHEET_ID), sh = ss.getSheetByName(MTD_SHEET_TAB);
    if (!sh) return null; var d = sh.getDataRange().getValues();
    for (var i = 2; i < d.length; i++) {
      if (String(d[i][0] || "").trim().toLowerCase().indexOf(BRAND_NAME.toLowerCase()) >= 0) {
        var sf = Number(d[i][3])||0, ms = Number(d[i][6])||0, saf = Number(d[i][11])||0, mas = Number(d[i][14])||0, day = Number(d[0][21])||1, md = Number(d[0][23])||30;
        return { spendForecast:sf, mtdSpend:ms, salesForecast:saf, mtdSales:mas, spendPct:sf>0?rnd(ms/sf*100,1):0, salesPct:saf>0?rnd(mas/saf*100,1):0, roasTarget:sf>0?rnd(saf/sf):0, day:day, monthDays:md, roasMtd:ms>0?rnd(mas/ms):0 };
      }
    } return null;
  } catch(e) { return null; }
}

function loadWeekPair(weekName) {
  var weeks = getWeekList(), idx = weeks.indexOf(weekName);
  var cur = gc("wk_"+weekName); if (!cur) { cur = getWeekData(weekName); sc("wk_"+weekName, cur); }
  var prev = null; if (idx > 0) { var pw = weeks[idx-1]; prev = gc("wk_"+pw); if (!prev) { prev = getWeekData(pw); sc("wk_"+pw, prev); } }
  cur.mtd = getMTDData(); return { brand: BRAND_NAME, weekOrder: weeks, cur: cur, prev: prev };
}

function getAllWeeksSummary() {
  var cached = gc("trend"); if (cached) return cached;
  var weeks = getWeekList(), result = {};
  weeks.forEach(function(w) { var wc = gc("wk_"+w);
    if (wc && wc.sales) { result[w] = { spend:wc.spend, sales:wc.sales, clicks:wc.clicks, orders:wc.orders, roas:wc.roas }; return; }
    try { var bf = getBrandFolder(), wfs = bf.getFoldersByName(w); if (!wfs.hasNext()) return; var wf = wfs.next(), files = wf.getFiles();
      while (files.hasNext()) { var file = files.next(); if (file.getName().toLowerCase().indexOf(".csv") >= 0) { var c = file.getBlob().getDataAsString(), hdr = c.split("\n")[0].toLowerCase();
        if (hdr.indexOf("date") >= 0 && hdr.indexOf("campaign") >= 0) { var rows = parseCampaignCSV(c); var sp=0,sa=0,cl=0,od=0; rows.forEach(function(r){sp+=r.spend;sa+=r.sales;cl+=r.clicks;od+=r.orders}); result[w]={spend:rnd(sp),sales:rnd(sa),clicks:cl,orders:od,roas:sp>0?rnd(sa/sp):0}; break; } } }
    } catch(e) { result[w] = {}; } });
  var out = { weekOrder:weeks, weeks:result }; sc("trend", out); return out;
}

function getWeekData(weekName) {
  var bf = getBrandFolder(), wfs = bf.getFoldersByName(weekName);
  if (!wfs.hasNext()) return { error: "Week not found" };
  var wf = wfs.next(), files = wf.getFiles(), camp=null, search=null, prod=null, biz=null, xlsxFiles=[];
  while (files.hasNext()) { var f = files.next(), nm = f.getName().toLowerCase();
    try { if (nm.indexOf(".csv") >= 0) { var txt = f.getBlob().getDataAsString(), hdr = txt.split("\n")[0].toLowerCase();
      if (hdr.indexOf("date") >= 0 && hdr.indexOf("campaign") >= 0) camp = parseCampaignCSV(txt);
      else if (hdr.indexOf("asin") >= 0 && (hdr.indexOf("session") >= 0 || hdr.indexOf("ordered product") >= 0)) biz = parseBusinessCSV(txt);
    } else if (nm.indexOf(".xlsx") >= 0) xlsxFiles.push(f); } catch(e) { Logger.log(nm+": "+e); } }
  for (var i = 0; i < xlsxFiles.length; i++) { try { var p = parseXLSX(xlsxFiles[i].getBlob()); var hs = p.headers.map(function(h){return h.toLowerCase()});
    if (hs.some(function(h){return h.indexOf("customer search term")>=0})) search = processSearchTerms(p);
    else if (hs.some(function(h){return h.indexOf("advertised asin")>=0||h.indexOf("advertised sku")>=0})) prod = processProducts(p, biz);
  } catch(e) { Logger.log("XLSX error: "+xlsxFiles[i].getName()+": "+e); } }
  if (prod && biz && biz.titles) { prod.forEach(function(p){ if(biz.titles[p.asin]){p.title=shortenTitle(biz.titles[p.asin])} else p.title=shortenTitle(p.title||p.sku||p.asin) }); }
  var r = { label:weekName, range:weekName, brand:BRAND_NAME };
  if (camp && camp.length) { var sp=0,sa=0,cl=0,im=0,od=0,no=0,ns=0,bs=0,ba=0,gs=0,ga=0;
    camp.forEach(function(x){sp+=x.spend;sa+=x.sales;cl+=x.clicks;im+=x.impressions;od+=x.orders;no+=x.ntbOrders;ns+=x.ntbSales;if(x.campaign.toLowerCase().indexOf("brand")>=0){bs+=x.spend;ba+=x.sales}else{gs+=x.spend;ga+=x.sales}});
    r.spend=rnd(sp);r.sales=rnd(sa);r.clicks=cl;r.imp=im;r.orders=od;r.roas=sp>0?rnd(sa/sp):0;r.acos=sa>0?rnd(sp/sa*100,1):0;r.cpc=cl>0?rnd(sp/cl):0;r.ctr=im>0?rnd(cl/im*100):0;r.cvr=cl>0?rnd(od/cl*100,1):0;r.ntbOrders=no;r.ntbSales=rnd(ns);
    r.brandCampaigns={spend:Math.round(bs),sales:Math.round(ba),roas:bs>0?rnd(ba/bs):0,acos:ba>0?rnd(bs/ba*100,1):0};
    r.genericCampaigns={spend:Math.round(gs),sales:Math.round(ga),roas:gs>0?rnd(ga/gs):0,acos:ga>0?rnd(gs/ga*100,1):0}; }
  if (search) { r.searchTermsTop=search.top; r.searchTermsLow=search.low; r.searchTermsOpp=search.opp; }
  if (prod) r.products = prod;
  if (biz) r.business = { sessions:biz.sessions, revenue:biz.revenue, units:biz.units, totalOrders:biz.totalOrders, pageViews:biz.pageViews, avgBuyBox:biz.avgBuyBox, convRate:biz.convRate };
  return r;
}

// ── Utilities ────────────────────────────────────────
function rnd(n,d){var m=Math.pow(10,d||2);return Math.round(n*m)/m}
function pI(v){return parseInt(String(v||"0").replace(/[^0-9]/g,""))||0}
function pF(v){return parseFloat(String(v||"0").replace(/[^0-9.]/g,""))||0}
function fi(arr,fn){for(var i=0;i<arr.length;i++)if(fn(arr[i]))return i;return-1}

function shortenTitle(t) {
  if (!t) return "";
  t = t.replace(/^Solbari\s*/i,"");
  t = t.replace(/Women[\u2018\u2019\'']?s?\s*/i,"");
  t = t.replace(/Men[\u2018\u2019\'']?s?\s*/i,"");
  ["UPF 50+","UPF50+","UPF 50","Packable ","UV Sun Protection ","UV Protection ","Sun Protective ",
   "with Large Brim and Detachable Strap","with Full Coverage Brim","Adjustable Size","Adjustable Fit",
   "Breathable ","Lightweight ","Ponytail Opening","Sun Protection ","for Women","for Men",
   "Hat, ","Hats ","Hats,"].forEach(function(x){t=t.split(x).join("")});
  t = t.replace(/[\u2018\u2019\''],?\s*/g," ").replace(/\s{2,}/g," ").replace(/^[\s,\-]+|[\s,\-]+$/g,"");
  if (t.length > 40) { var parts = t.split(/ - | \u2013 |, /); if (parts.length >= 2) { var f=parts[0].trim(), l=parts[parts.length-1].trim(); t=(f+" - "+l).length<=45?f+" - "+l:f; } }
  return t.length > 45 ? t.substring(0,42)+"..." : t;
}

// ── Parsers ──────────────────────────────────────────
function parseCampaignCSV(c) {
  var rows=Utilities.parseCsv(c);if(rows.length<2)return[];var h=rows[0].map(function(x){return x.toLowerCase().trim().replace(/^\ufeff/,"")});
  var gi=function(k){return fi(h,function(x){return x.indexOf(k)>=0})};
  var iD=gi("date"),iC=gi("campaign name"),iI=gi("impressions"),iK=gi("clicks"),iCo=gi("total cost"),iO=gi("purchases"),iS=fi(h,function(x){return x==="sales"||x==="sales "}),iNO=gi("purchases (new to brand)"),iNS=gi("sales (new to brand)");
  if(iS<0)return[];var result=[];
  for(var i=1;i<rows.length;i++){var r=rows[i];if(!r[iD])continue;result.push({date:r[iD],campaign:r[iC]||"",impressions:pI(r[iI]),clicks:pI(r[iK]),spend:pF(r[iCo]),orders:pI(r[iO]),sales:pF(r[iS]),ntbOrders:iNO>=0?pI(r[iNO]):0,ntbSales:iNS>=0?pF(r[iNS]):0})}return result;
}

function parseBusinessCSV(c) {
  var rows=Utilities.parseCsv(c);if(rows.length<2)return{sessions:0,revenue:0,units:0,totalOrders:0,pageViews:0,avgBuyBox:0,convRate:0,titles:{}};
  var h=rows[0].map(function(x){return x.toLowerCase().trim().replace(/^\ufeff/,"")});
  var iP=fi(h,function(x){return x.indexOf("(parent) asin")>=0}),iA=fi(h,function(x){return x.indexOf("(child) asin")>=0}),iT=fi(h,function(x){return x==="title"});
  var iS=fi(h,function(x){return x.indexOf("sessions")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});
  var iR=fi(h,function(x){return x.indexOf("ordered product sales")>=0&&x.indexOf("b2b")<0});
  var iU=fi(h,function(x){return x.indexOf("units ordered")>=0&&x.indexOf("b2b")<0});
  var iO=fi(h,function(x){return x.indexOf("total order items")>=0&&x.indexOf("b2b")<0});
  var iPV=fi(h,function(x){return x.indexOf("page views")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});
  var iBB=fi(h,function(x){return x.indexOf("featured offer")>=0&&x.indexOf("buy box")>=0&&x.indexOf("b2b")<0});
  var sess=0,rev=0,units=0,orders=0,pv=0,bbS=0,bbC=0,titles={};
  for(var i=1;i<rows.length;i++){var r=rows[i];
    if(iS>=0)sess+=pI(r[iS]);if(iR>=0)rev+=pF(r[iR]);if(iU>=0)units+=pI(r[iU]);if(iO>=0)orders+=pI(r[iO]);if(iPV>=0)pv+=pI(r[iPV]);
    if(iBB>=0&&r[iBB]){var b=parseFloat(String(r[iBB]).replace(/[^0-9.]/g,""));if(b>0){bbS+=b;bbC++}}
    var title=iT>=0?String(r[iT]||"").trim():"";
    if(title){if(iA>=0&&r[iA])titles[String(r[iA]).trim()]=title;if(iP>=0&&r[iP]){var pa=String(r[iP]).trim();if(!titles[pa])titles[pa]=title}}
  }
  return{sessions:sess,revenue:rnd(rev),units:units,totalOrders:orders,pageViews:pv,avgBuyBox:bbC>0?rnd(bbS/bbC,1):0,convRate:sess>0?rnd(units/sess*100,1):0,titles:titles};
}

function parseXLSX(blob){var tid=null;try{var res=Drive.Files.insert({title:"_t"+Date.now(),mimeType:"application/vnd.google-apps.spreadsheet"},blob,{convert:true});tid=res.id;var ss=SpreadsheetApp.openById(tid);var d=ss.getSheets()[0].getDataRange().getValues();DriveApp.getFileById(tid).setTrashed(true);return{headers:d[0].map(function(h){return String(h||"")}),rows:d.slice(1)}}catch(e){if(tid)try{DriveApp.getFileById(tid).setTrashed(true)}catch(x){}throw e}}

function processSearchTerms(ct){var h=ct.headers.map(function(x){return x.toLowerCase().trim()});
  var iT=fi(h,function(x){return x.indexOf("customer search term")>=0}),iI=fi(h,function(x){return x==="impressions"}),iC=fi(h,function(x){return x==="clicks"}),iSp=fi(h,function(x){return x==="spend"}),iSa=fi(h,function(x){return x.indexOf("7 day total sales")>=0&&x.indexOf("other")<0&&x.indexOf("sku")<0}),iO=fi(h,function(x){return x.indexOf("7 day total orders")>=0});
  var terms={};ct.rows.forEach(function(r){var t=String(r[iT]||"").trim();if(!t)return;if(!terms[t])terms[t]={i:0,c:0,s:0,sa:0,o:0};terms[t].i+=Number(r[iI])||0;terms[t].c+=Number(r[iC])||0;terms[t].s+=Number(r[iSp])||0;terms[t].sa+=Number(r[iSa])||0;terms[t].o+=Number(r[iO])||0});
  var sorted=Object.entries(terms).sort(function(a,b){return b[1].sa-a[1].sa});
  return{top:sorted.slice(0,15).map(function(e){var t=e[0],d=e[1];return{term:t,sales:rnd(d.sa),spend:rnd(d.s),roas:d.s>0?rnd(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}}),
    low:Object.entries(terms).filter(function(e){return e[1].s>=5&&e[1].sa===0&&e[1].c>=30}).sort(function(a,b){return b[1].s-a[1].s}).slice(0,15).map(function(e){return{term:e[0],spend:rnd(e[1].s),clicks:Math.round(e[1].c)}}),
    opp:Object.entries(terms).filter(function(e){var t=e[0],d=e[1];return d.s>0&&d.sa>0&&d.sa/d.s>5&&!BRAND_KEYWORDS.some(function(bk){return t.toLowerCase().indexOf(bk)>=0})}).sort(function(a,b){return(b[1].sa/b[1].s)-(a[1].sa/a[1].s)}).slice(0,10).map(function(e){var t=e[0],d=e[1];return{term:t,sales:rnd(d.sa),spend:rnd(d.s),roas:rnd(d.sa/d.s,1)}})};
}

function processProducts(ct,biz){var h=ct.headers.map(function(x){return x.toLowerCase().trim()});
  var iA=fi(h,function(x){return x.indexOf("advertised asin")>=0}),iSk=fi(h,function(x){return x.indexOf("advertised sku")>=0}),iSp=fi(h,function(x){return x==="spend"}),iSa=fi(h,function(x){return x.indexOf("7 day total sales")>=0&&x.indexOf("other")<0&&x.indexOf("sku")<0}),iO=fi(h,function(x){return x.indexOf("7 day total orders")>=0}),iC=fi(h,function(x){return x==="clicks"});
  var titles=(biz&&biz.titles)||{};var prods={};
  ct.rows.forEach(function(r){var a=String(r[iA]||"").trim();if(!a)return;if(!prods[a])prods[a]={sku:String(r[iSk]||""),title:titles[a]||"",s:0,sa:0,o:0,c:0};prods[a].s+=Number(r[iSp])||0;prods[a].sa+=Number(r[iSa])||0;prods[a].o+=Number(r[iO])||0;prods[a].c+=Number(r[iC])||0});
  return Object.entries(prods).sort(function(a,b){return b[1].sa-a[1].sa}).slice(0,20).map(function(e){var a=e[0],d=e[1];return{asin:a,sku:d.sku,title:d.title||d.sku||a,sales:rnd(d.sa),spend:rnd(d.s),roas:d.s>0?rnd(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}});
}
