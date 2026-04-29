/**
 * Pattern Weekly Dashboard — API v5
 * ──────────────────────────────────
 * Single combined CSV + Business Report CSV per week.
 * No XLSX. No Drive Advanced Service.
 *
 * FILE STRUCTURE PER WEEK:
 *   Week 16/
 *     Solbari_Week_16.csv          ← Combined search term report (all data)
 *     BusinessReport.csv           ← Amazon business report
 *
 * The combined CSV has: Date, Campaign name, Advertised product ID,
 *   Search term, Impressions, Clicks, Total cost, Sales, Purchases, NTB
 * 
 * All derived metrics calculated: ROAS, ACOS, CPC, CTR, CVR
 */

var BRAND_NAME = "Solbari";
var BRAND_FOLDER_ID = "1zFv9PXv_qxBcPJCwMGcjpP6zZ6cfXb2A";
var BRAND_KEYWORDS = ["solbari"];
var CACHE_TTL = 3600;

var MTD_SHEET_ID = "YOUR_MTD_TRACKER_SHEET_ID_HERE";
var MTD_SHEET_TAB = "Apr 2026";


// ═══════════════════════════════════════════════════════
// API ENDPOINT
// ═══════════════════════════════════════════════════════

function doGet(e) {
  var action = (e.parameter.action || "").toLowerCase();
  var result;
  try {
    switch (action) {
      case "weeks":     result = { weeks: getWeekList(), brand: BRAND_NAME }; break;
      case "week":      result = loadWeekPair(e.parameter.week || ""); break;
      case "trend":     result = getAllWeeksSummary(); break;
      case "refresh":   clearAllCache(); result = (e.parameter.week) ? loadWeekPair(e.parameter.week) : { weeks: getWeekList(), brand: BRAND_NAME }; break;
      case "debug":     result = debugWeek(e.parameter.week || ""); break;
      case "getnotes":  result = getNotes(e.parameter.week || ""); break;
      case "savenotes": result = saveNotes(e.parameter.week || "", e.parameter.summary || "", e.parameter.recs || ""); break;
      default:          result = { error: "Use: weeks, week, trend, refresh, debug, getnotes, savenotes" };
    }
  } catch (err) { result = { error: err.toString(), stack: err.stack }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


// ═══════════════════════════════════════════════════════
// NOTES (persistent, free)
// ═══════════════════════════════════════════════════════

function getNotes(wk) {
  var p = PropertiesService.getScriptProperties();
  return { week: wk, summary: p.getProperty("s_" + wk) || "", recs: p.getProperty("r_" + wk) || "" };
}

function saveNotes(wk, summary, recs) {
  var p = PropertiesService.getScriptProperties();
  p.setProperty("s_" + wk, summary);
  p.setProperty("r_" + wk, recs);
  return { ok: true };
}


// ═══════════════════════════════════════════════════════
// DEBUG
// ═══════════════════════════════════════════════════════

function testDebug() {
  var weeks = getWeekList();
  Logger.log(JSON.stringify(debugWeek(weeks[weeks.length - 1]), null, 2));
}

function debugWeek(weekName) {
  var info = { brand: BRAND_NAME, files: [], errors: [] };
  try {
    var bf = getBrandFolder();
    info.brandFolder = bf.getName();
    info.allWeeks = getWeekList();
    if (!weekName) weekName = info.allWeeks[info.allWeeks.length - 1];
    info.weekName = weekName;

    var wfs = bf.getFoldersByName(weekName);
    if (!wfs.hasNext()) { info.errors.push("Folder not found"); return info; }
    var files = wfs.next().getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var fi = { name: f.getName(), size: f.getSize() };
      var nm = f.getName().toLowerCase();
      if (nm.indexOf(".csv") >= 0) {
        var txt = f.getBlob().getDataAsString();
        var hdr = txt.split("\n")[0].toLowerCase().replace(/^\ufeff/, "");
        fi.cols = hdr.substring(0, 200);
        fi.rows = txt.split("\n").length;
        if (hdr.indexOf("search term") >= 0 && hdr.indexOf("advertised product") >= 0) {
          fi.type = "Combined Report";
        } else if (hdr.indexOf("asin") >= 0 && (hdr.indexOf("session") >= 0 || hdr.indexOf("ordered product") >= 0)) {
          fi.type = "Business Report";
        } else if (hdr.indexOf("date") >= 0 && hdr.indexOf("campaign") >= 0 && hdr.indexOf("search term") < 0) {
          fi.type = "Campaign Only";
        } else if (hdr.indexOf("customer search term") >= 0) {
          fi.type = "Search Term Report";
        } else if (hdr.indexOf("advertised asin") >= 0 || hdr.indexOf("advertised sku") >= 0) {
          fi.type = "Product Report";
        } else {
          fi.type = "Unknown";
        }
        fi.status = "OK";
      } else {
        fi.type = nm.indexOf(".xlsx") >= 0 ? "XLSX (convert to CSV)" : "Other";
        fi.status = "SKIPPED";
      }
      info.files.push(fi);
    }
  } catch (e) { info.errors.push(e.toString()); }
  return info;
}


// ═══════════════════════════════════════════════════════
// FOLDERS
// ═══════════════════════════════════════════════════════

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
  return w.sort(function(a, b) {
    var na = parseInt(a.replace(/\D/g, "")), nb = parseInt(b.replace(/\D/g, ""));
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
  });
}


// ═══════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════

function gc(k) { try { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch(e) { return null; } }
function sc(k, v) { try { var s = JSON.stringify(v); if (s.length < 100000) CacheService.getScriptCache().put(k, s, CACHE_TTL); } catch(e) {} }
function clearAllCache() { try { var c = CacheService.getScriptCache(); c.removeAll(getWeekList().map(function(w) { return "wk_" + w; })); c.remove("trend"); } catch(e) {} }


// ═══════════════════════════════════════════════════════
// MTD (optional)
// ═══════════════════════════════════════════════════════

function getMTDData() {
  try {
    if (!MTD_SHEET_ID || MTD_SHEET_ID === "YOUR_MTD_TRACKER_SHEET_ID_HERE") return null;
    var ss = SpreadsheetApp.openById(MTD_SHEET_ID), sh = ss.getSheetByName(MTD_SHEET_TAB);
    if (!sh) return null;
    var d = sh.getDataRange().getValues();
    for (var i = 2; i < d.length; i++) {
      if (String(d[i][0] || "").toLowerCase().indexOf(BRAND_NAME.toLowerCase()) >= 0) {
        var sf = N(d[i][3]), ms = N(d[i][6]), saf = N(d[i][11]), mas = N(d[i][14]);
        var day = N(d[0][21]) || 1, md = N(d[0][23]) || 30;
        return { spendForecast:sf, mtdSpend:ms, salesForecast:saf, mtdSales:mas,
          spendPct:sf>0?R(ms/sf*100,1):0, salesPct:saf>0?R(mas/saf*100,1):0,
          roasTarget:sf>0?R(saf/sf):0, day:day, monthDays:md, roasMtd:ms>0?R(mas/ms):0 };
      }
    }
    return null;
  } catch(e) { return null; }
}


// ═══════════════════════════════════════════════════════
// MAIN LOADERS
// ═══════════════════════════════════════════════════════

function loadWeekPair(weekName) {
  var weeks = getWeekList(), idx = weeks.indexOf(weekName);
  var cur = gc("wk_" + weekName);
  if (!cur) { cur = getWeekData(weekName); sc("wk_" + weekName, cur); }
  var prev = null;
  if (idx > 0) { var pw = weeks[idx - 1]; prev = gc("wk_" + pw); if (!prev) { prev = getWeekData(pw); sc("wk_" + pw, prev); } }
  cur.mtd = getMTDData();
  var notes = getNotes(weekName);
  cur.savedSummary = notes.summary;
  cur.savedRecs = notes.recs;
  return { brand: BRAND_NAME, weekOrder: weeks, cur: cur, prev: prev };
}

function getAllWeeksSummary() {
  var cached = gc("trend"); if (cached) return cached;
  var weeks = getWeekList(), result = {};
  weeks.forEach(function(w) {
    var wc = gc("wk_" + w);
    if (wc && wc.sales) { result[w] = { spend:wc.spend, sales:wc.sales, clicks:wc.clicks, orders:wc.orders, roas:wc.roas }; return; }
    try {
      var d = getWeekData(w);
      if (d.sales) result[w] = { spend:d.spend, sales:d.sales, clicks:d.clicks, orders:d.orders, roas:d.roas };
      sc("wk_" + w, d);
    } catch(e) {}
  });
  var out = { weekOrder: weeks, weeks: result }; sc("trend", out); return out;
}


// ═══════════════════════════════════════════════════════
// WEEK DATA — parses all CSVs in a week folder
// ═══════════════════════════════════════════════════════

function getWeekData(weekName) {
  var bf = getBrandFolder();
  var wfs = bf.getFoldersByName(weekName);
  if (!wfs.hasNext()) return { error: "Week not found: " + weekName };

  var wf = wfs.next(), files = wf.getFiles();
  var combined = null, biz = null;
  var campOnly = null, searchCSV = null, prodCSV = null;

  // Read all CSV files and classify
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().toLowerCase().indexOf(".csv") < 0) continue;
    var txt = f.getBlob().getDataAsString();
    var hdr = txt.split("\n")[0].toLowerCase().replace(/^\ufeff/, "");

    if (hdr.indexOf("search term") >= 0 && hdr.indexOf("advertised product") >= 0) {
      combined = txt;  // Combined report — has everything
    } else if (hdr.indexOf("asin") >= 0 && (hdr.indexOf("session") >= 0 || hdr.indexOf("ordered product") >= 0)) {
      biz = parseBusinessCSV(txt);  // Business report
    } else if (hdr.indexOf("customer search term") >= 0) {
      searchCSV = txt;  // Standalone search term CSV
    } else if (hdr.indexOf("advertised asin") >= 0 || hdr.indexOf("advertised sku") >= 0) {
      prodCSV = txt;  // Standalone product CSV
    } else if (hdr.indexOf("date") >= 0 && hdr.indexOf("campaign") >= 0) {
      campOnly = txt;  // Campaign-only CSV
    }
  }

  var r = { label: weekName, brand: BRAND_NAME };

  // ── If we have the combined report, use it for everything ──
  if (combined) {
    var parsed = parseCombinedCSV(combined, biz);
    r = mergeObj(r, parsed);
  }
  // ── Fallback: separate files ──
  else {
    if (campOnly) {
      var camp = parseCampaignRows(campOnly);
      r = mergeObj(r, camp);
    }
    if (searchCSV) r = mergeObj(r, { searchTermsTop: processSearchCSV(searchCSV).top, searchTermsLow: processSearchCSV(searchCSV).low, searchTermsOpp: processSearchCSV(searchCSV).opp });
    if (prodCSV) r.products = processProductCSV(prodCSV, biz);
  }

  if (biz) {
    r.business = { sessions:biz.sessions, revenue:biz.revenue, units:biz.units,
      totalOrders:biz.totalOrders, pageViews:biz.pageViews,
      avgBuyBox:biz.avgBuyBox, convRate:biz.convRate };
  }

  return r;
}


// ═══════════════════════════════════════════════════════
// COMBINED CSV PARSER — the main new parser
// ═══════════════════════════════════════════════════════

function parseCombinedCSV(txt, biz) {
  var rows = Utilities.parseCsv(txt);
  if (rows.length < 2) return {};

  var h = rows[0].map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var col = function(k) { return fi(h, function(x) { return x.indexOf(k) >= 0; }); };

  var iCamp = col("campaign name");
  var iAsin = col("advertised product id");
  var iST   = col("search term");
  var iImp  = col("impressions");
  var iClk  = col("clicks");
  var iCost = col("total cost");
  var iSales = fi(h, function(x) { return x === "sales" || x === "sales "; });
  var iOrd  = col("purchases");
  var iNTBo = col("purchases (new to brand)");
  var iNTBs = col("sales (new to brand)");

  if (iSales < 0) iSales = col("sales");

  // Aggregators
  var totals = { sp:0, sa:0, cl:0, im:0, od:0, no:0, ns:0, bs:0, ba:0, gs:0, ga:0 };
  var terms = {};
  var prods = {};
  var titles = (biz && biz.titles) || {};

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var camp = S(r[iCamp]);
    var asin = S(r[iAsin]);
    var term = S(r[iST]);
    var imp  = N(r[iImp]);
    var clk  = N(r[iClk]);
    var cost = F(r[iCost]);
    var sale = F(r[iSales]);
    var ord  = N(r[iOrd]);
    var ntbo = iNTBo >= 0 ? N(r[iNTBo]) : 0;
    var ntbs = iNTBs >= 0 ? F(r[iNTBs]) : 0;

    // Totals
    totals.sp += cost; totals.sa += sale; totals.cl += clk;
    totals.im += imp; totals.od += ord; totals.no += ntbo; totals.ns += ntbs;

    // Brand vs Generic
    if (camp.toLowerCase().indexOf("brand") >= 0) { totals.bs += cost; totals.ba += sale; }
    else { totals.gs += cost; totals.ga += sale; }

    // Search terms
    if (term) {
      if (!terms[term]) terms[term] = { i:0, c:0, s:0, sa:0, o:0 };
      terms[term].i += imp; terms[term].c += clk; terms[term].s += cost; terms[term].sa += sale; terms[term].o += ord;
    }

    // Products
    if (asin) {
      if (!prods[asin]) prods[asin] = { s:0, sa:0, o:0, c:0 };
      prods[asin].s += cost; prods[asin].sa += sale; prods[asin].o += ord; prods[asin].c += clk;
    }
  }

  var t = totals;
  var result = {
    spend: R(t.sp), sales: R(t.sa), clicks: t.cl, imp: t.im, orders: t.od,
    ntbOrders: t.no, ntbSales: R(t.ns),

    // Derived metrics
    roas:  t.sp > 0 ? R(t.sa / t.sp) : 0,
    acos:  t.sa > 0 ? R(t.sp / t.sa * 100, 1) : 0,
    cpc:   t.cl > 0 ? R(t.sp / t.cl) : 0,
    ctr:   t.im > 0 ? R(t.cl / t.im * 100) : 0,
    cvr:   t.cl > 0 ? R(t.od / t.cl * 100, 1) : 0,

    brandCampaigns: {
      spend: Math.round(t.bs), sales: Math.round(t.ba),
      roas: t.bs > 0 ? R(t.ba / t.bs) : 0, acos: t.ba > 0 ? R(t.bs / t.ba * 100, 1) : 0
    },
    genericCampaigns: {
      spend: Math.round(t.gs), sales: Math.round(t.ga),
      roas: t.gs > 0 ? R(t.ga / t.gs) : 0, acos: t.ga > 0 ? R(t.gs / t.ga * 100, 1) : 0
    },

    funnel: { impressions: t.im, clicks: t.cl, orders: t.od, ctr: t.im > 0 ? R(t.cl / t.im * 100) : 0, cvr: t.cl > 0 ? R(t.od / t.cl * 100, 1) : 0 }
  };

  // Search terms
  var sorted = Object.entries(terms).sort(function(a, b) { return b[1].sa - a[1].sa; });
  result.searchTermsTop = sorted.slice(0, 15).map(function(e) {
    var t = e[0], d = e[1];
    return { term:t, sales:R(d.sa), spend:R(d.s), roas:d.s>0?R(d.sa/d.s,1):0, orders:Math.round(d.o), clicks:Math.round(d.c) };
  });
  result.searchTermsLow = Object.entries(terms)
    .filter(function(e) { return e[1].s >= 5 && e[1].sa === 0 && e[1].c >= 30; })
    .sort(function(a, b) { return b[1].s - a[1].s; }).slice(0, 15)
    .map(function(e) { return { term:e[0], spend:R(e[1].s), clicks:Math.round(e[1].c) }; });
  result.searchTermsOpp = Object.entries(terms)
    .filter(function(e) { var t=e[0],d=e[1]; return d.s>0 && d.sa>0 && d.sa/d.s>5 && !BRAND_KEYWORDS.some(function(bk){return t.toLowerCase().indexOf(bk)>=0}); })
    .sort(function(a, b) { return (b[1].sa/b[1].s) - (a[1].sa/a[1].s); }).slice(0, 10)
    .map(function(e) { var t=e[0],d=e[1]; return { term:t, sales:R(d.sa), spend:R(d.s), roas:R(d.sa/d.s,1) }; });

  // Products
  result.products = Object.entries(prods).sort(function(a, b) { return b[1].sa - a[1].sa; }).slice(0, 20)
    .map(function(e) {
      var a=e[0], d=e[1];
      return { asin:a, title:shortenTitle(titles[a]||a), sales:R(d.sa), spend:R(d.s),
        roas:d.s>0?R(d.sa/d.s,1):0, orders:Math.round(d.o), clicks:Math.round(d.c) };
    });

  return result;
}


// ═══════════════════════════════════════════════════════
// FALLBACK PARSERS (for old-style separate files)
// ═══════════════════════════════════════════════════════

function parseCampaignRows(txt) {
  var rows = Utilities.parseCsv(txt);
  if (rows.length < 2) return {};
  var h = rows[0].map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var col = function(k) { return fi(h, function(x) { return x.indexOf(k) >= 0; }); };
  var iD=col("date"),iC=col("campaign name"),iI=col("impressions"),iK=col("clicks"),iCo=col("total cost"),iO=col("purchases");
  var iS=fi(h,function(x){return x==="sales"||x==="sales ";}),iNO=col("purchases (new to brand)"),iNS=col("sales (new to brand)");
  if(iS<0) return {};
  var sp=0,sa=0,cl=0,im=0,od=0,no=0,ns=0,bs=0,ba=0,gs=0,ga=0;
  for(var i=1;i<rows.length;i++){var r=rows[i];if(!r[iD])continue;var cost=F(r[iCo]),sale=F(r[iS]),clicks=N(r[iK]),imps=N(r[iI]),orders=N(r[iO]);
    sp+=cost;sa+=sale;cl+=clicks;im+=imps;od+=orders;no+=iNO>=0?N(r[iNO]):0;ns+=iNS>=0?F(r[iNS]):0;
    if(S(r[iC]).toLowerCase().indexOf("brand")>=0){bs+=cost;ba+=sale}else{gs+=cost;ga+=sale}
  }
  return{spend:R(sp),sales:R(sa),clicks:cl,imp:im,orders:od,ntbOrders:no,ntbSales:R(ns),
    roas:sp>0?R(sa/sp):0,acos:sa>0?R(sp/sa*100,1):0,cpc:cl>0?R(sp/cl):0,ctr:im>0?R(cl/im*100):0,cvr:cl>0?R(od/cl*100,1):0,
    brandCampaigns:{spend:Math.round(bs),sales:Math.round(ba),roas:bs>0?R(ba/bs):0,acos:ba>0?R(bs/ba*100,1):0},
    genericCampaigns:{spend:Math.round(gs),sales:Math.round(ga),roas:gs>0?R(ga/gs):0,acos:ga>0?R(gs/ga*100,1):0},
    funnel:{impressions:im,clicks:cl,orders:od,ctr:im>0?R(cl/im*100):0,cvr:cl>0?R(od/cl*100,1):0}};
}

function processSearchCSV(txt) {
  var rows = Utilities.parseCsv(txt);
  var ct = { headers: rows[0].map(function(h) { return String(h || ""); }), rows: rows.slice(1) };
  var h = ct.headers.map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var iT=fi(h,function(x){return x.indexOf("customer search term")>=0}),iC=fi(h,function(x){return x==="clicks"}),iSp=fi(h,function(x){return x==="spend"});
  var iSa=fi(h,function(x){return x.indexOf("7 day total sales")>=0&&x.indexOf("other")<0&&x.indexOf("sku")<0}),iO=fi(h,function(x){return x.indexOf("7 day total orders")>=0});
  var terms={};ct.rows.forEach(function(r){var t=S(r[iT]);if(!t)return;if(!terms[t])terms[t]={c:0,s:0,sa:0,o:0};terms[t].c+=N(r[iC]);terms[t].s+=F(r[iSp]);terms[t].sa+=F(r[iSa]);terms[t].o+=N(r[iO])});
  var sorted=Object.entries(terms).sort(function(a,b){return b[1].sa-a[1].sa});
  return{top:sorted.slice(0,15).map(function(e){var t=e[0],d=e[1];return{term:t,sales:R(d.sa),spend:R(d.s),roas:d.s>0?R(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}}),
    low:Object.entries(terms).filter(function(e){return e[1].s>=5&&e[1].sa===0&&e[1].c>=30}).sort(function(a,b){return b[1].s-a[1].s}).slice(0,15).map(function(e){return{term:e[0],spend:R(e[1].s),clicks:Math.round(e[1].c)}}),
    opp:Object.entries(terms).filter(function(e){var t=e[0],d=e[1];return d.s>0&&d.sa>0&&d.sa/d.s>5&&!BRAND_KEYWORDS.some(function(bk){return t.toLowerCase().indexOf(bk)>=0})}).sort(function(a,b){return(b[1].sa/b[1].s)-(a[1].sa/a[1].s)}).slice(0,10).map(function(e){var t=e[0],d=e[1];return{term:t,sales:R(d.sa),spend:R(d.s),roas:R(d.sa/d.s,1)}})};
}

function processProductCSV(txt, biz) {
  var rows = Utilities.parseCsv(txt);
  var h = rows[0].map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var iA=fi(h,function(x){return x.indexOf("advertised asin")>=0}),iSp=fi(h,function(x){return x==="spend"});
  var iSa=fi(h,function(x){return x.indexOf("7 day total sales")>=0&&x.indexOf("other")<0&&x.indexOf("sku")<0});
  var iO=fi(h,function(x){return x.indexOf("7 day total orders")>=0}),iC=fi(h,function(x){return x==="clicks"});
  var titles=(biz&&biz.titles)||{};var prods={};
  rows.slice(1).forEach(function(r){var a=S(r[iA]);if(!a)return;if(!prods[a])prods[a]={s:0,sa:0,o:0,c:0};prods[a].s+=F(r[iSp]);prods[a].sa+=F(r[iSa]);prods[a].o+=N(r[iO]);prods[a].c+=N(r[iC])});
  return Object.entries(prods).sort(function(a,b){return b[1].sa-a[1].sa}).slice(0,20).map(function(e){var a=e[0],d=e[1];return{asin:a,title:shortenTitle(titles[a]||a),sales:R(d.sa),spend:R(d.s),roas:d.s>0?R(d.sa/d.s,1):0,orders:Math.round(d.o),clicks:Math.round(d.c)}});
}


// ═══════════════════════════════════════════════════════
// BUSINESS REPORT PARSER
// ═══════════════════════════════════════════════════════

function parseBusinessCSV(c) {
  var rows = Utilities.parseCsv(c);
  if (rows.length < 2) return { sessions:0, revenue:0, units:0, totalOrders:0, pageViews:0, avgBuyBox:0, convRate:0, titles:{} };
  var h = rows[0].map(function(x) { return x.toLowerCase().trim().replace(/^\ufeff/, ""); });
  var iP=fi(h,function(x){return x.indexOf("(parent) asin")>=0}),iA=fi(h,function(x){return x.indexOf("(child) asin")>=0}),iT=fi(h,function(x){return x==="title"});
  var iS=fi(h,function(x){return x.indexOf("sessions")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});
  var iR=fi(h,function(x){return x.indexOf("ordered product sales")>=0&&x.indexOf("b2b")<0});
  var iU=fi(h,function(x){return x.indexOf("units ordered")>=0&&x.indexOf("b2b")<0});
  var iO=fi(h,function(x){return x.indexOf("total order items")>=0&&x.indexOf("b2b")<0});
  var iPV=fi(h,function(x){return x.indexOf("page views")>=0&&x.indexOf("total")>=0&&x.indexOf("b2b")<0&&x.indexOf("percent")<0});
  var iBB=fi(h,function(x){return x.indexOf("featured offer")>=0&&x.indexOf("buy box")>=0&&x.indexOf("b2b")<0});
  var sess=0,rev=0,units=0,orders=0,pv=0,bbS=0,bbC=0,titles={};
  for(var i=1;i<rows.length;i++){var r=rows[i];
    if(iS>=0)sess+=N(r[iS]);if(iR>=0)rev+=F(r[iR]);if(iU>=0)units+=N(r[iU]);if(iO>=0)orders+=N(r[iO]);if(iPV>=0)pv+=N(r[iPV]);
    if(iBB>=0&&r[iBB]){var b=parseFloat(String(r[iBB]).replace(/[^0-9.]/g,""));if(b>0){bbS+=b;bbC++}}
    var title=iT>=0?String(r[iT]||"").trim():"";
    if(title){if(iA>=0&&r[iA])titles[String(r[iA]).trim()]=title;if(iP>=0&&r[iP]){var pa=String(r[iP]).trim();if(!titles[pa])titles[pa]=title}}
  }
  return{sessions:sess,revenue:R(rev),units:units,totalOrders:orders,pageViews:pv,avgBuyBox:bbC>0?R(bbS/bbC,1):0,convRate:sess>0?R(units/sess*100,1):0,titles:titles};
}


// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════

function R(n, d) { var m = Math.pow(10, d || 2); return Math.round(n * m) / m; }
function N(v) { return parseInt(String(v || "0").replace(/[^0-9]/g, "")) || 0; }
function F(v) { return parseFloat(String(v || "0").replace(/[^0-9.\-]/g, "")) || 0; }
function S(v) { return String(v || "").trim(); }
function fi(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return i; return -1; }
function mergeObj(a, b) { for (var k in b) if (b.hasOwnProperty(k)) a[k] = b[k]; return a; }

function shortenTitle(t) {
  if (!t) return "";
  t = t.replace(/^Solbari\s*/i, "");
  t = t.replace(/Women[\u2018\u2019\'']?s?\s*/i, "");
  t = t.replace(/Men[\u2018\u2019\'']?s?\s*/i, "");
  ["UPF 50+","UPF50+","UPF 50","Packable ","UV Sun Protection ","UV Protection ","Sun Protective ",
   "with Large Brim and Detachable Strap","with Full Coverage Brim","Adjustable Size","Adjustable Fit",
   "Breathable ","Lightweight ","Ponytail Opening","Sun Protection ","for Women","for Men",
   "Hat, ","Hats ","Hats,"].forEach(function(x) { t = t.split(x).join(""); });
  t = t.replace(/[\u2018\u2019\''],?\s*/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s,\-]+|[\s,\-]+$/g, "");
  if (t.length > 40) { var parts = t.split(/ - | \u2013 |, /); if (parts.length >= 2) { var f=parts[0].trim(), l=parts[parts.length-1].trim(); t=(f+" - "+l).length<=45?f+" - "+l:f; } }
  return t.length > 45 ? t.substring(0, 42) + "..." : t;
}
