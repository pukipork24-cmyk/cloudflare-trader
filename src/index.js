// AI Trading Bot — Cloudflare Workers

import { AGENTS, AGENT_SYSTEM_PROMPTS, AI_PROVIDER } from './agents/registry.js';
import { getBalance, placeOrder, placeLimitOrder, placeStopLossOrder, placeTakeProfitOrder, getOpenOrders, cancelAllOrders } from './bitget.js';

// In-memory log storage for market intelligence reports
const intelligenceLogs = [];
const MAX_LOGS = 100;

// System event logs (errors, actions, trades, etc.)
const systemLogs = [];
const MAX_SYSTEM_LOGS = 20;

function addSystemLog(level, message, data = null) {
  const log = {
    timestamp: new Date().toISOString(),
    level: level, // 'INFO', 'WARN', 'ERROR', 'SUCCESS'
    message: message,
    data: data
  };
  systemLogs.unshift(log);
  if (systemLogs.length > MAX_SYSTEM_LOGS) systemLogs.pop();
  console.log(`[${level}] ${message}`, data || '');
}

// Trading state
const tradingState = {
  dailyLoss: 0,
  dailyResetDate: new Date().toDateString(),
  lastTradeTime: null,
  tradesLog: [],
  lastBalance: 30 // starting balance
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    function renderAnalysisPage() {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pukitradev2 - Chart Analysis</title>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
:root{
  --bg:#060d18;--surf:#0d1726;--card:#121f30;--card2:#17273d;
  --bdr:#243852;--bdr2:#325072;--txt:#e5eefb;--muted:#90a5c2;
  --gold:#6ec2ff;--gold2:#9fd7ff;--cyan:#7fd4ff;
  --green:#38d39f;--red:#f37d8f;--yellow:#f0c27a;
  --gold-glow:rgba(110,194,255,0.28);
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;
  --radius-sm:8px;--radius-md:12px;--radius-lg:16px;
  /* Motion tokens */
  --ease-out:cubic-bezier(.22,1,.36,1);
  --ease-soft:cubic-bezier(.2,.9,.2,1);
  --dur-1:140ms;
  --dur-2:220ms;
  --dur-3:420ms;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-size:13px}
body{
  background:var(--bg);color:var(--txt);
  font-family:Inter,'Segoe UI',system-ui,sans-serif;
  letter-spacing:.01em;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  overflow:hidden;
}
@media (prefers-reduced-motion: reduce){
  *{animation-duration:0.001ms !important;animation-iteration-count:1 !important;transition-duration:0.001ms !important;scroll-behavior:auto !important}
}
a{color:inherit;text-decoration:none}
#app{height:100vh;display:flex;flex-direction:column;min-height:0;position:relative;z-index:1}
#topbar{display:flex;align-items:center;justify-content:space-between;padding:0 1.5rem;
  background:linear-gradient(180deg,rgba(18,31,48,0.94),rgba(13,23,38,0.88));border-bottom:1px solid var(--bdr);backdrop-filter:blur(10px);min-height:54px}
.topbar-shell{position:relative}
.gradient-blur{position:fixed;z-index:0;inset:0 0 auto 0;height:12%;pointer-events:none;opacity:.95}
.gradient-blur > div,.gradient-blur::before,.gradient-blur::after{position:absolute;inset:0}
.gradient-blur::before{content:"";z-index:1;backdrop-filter:blur(.5px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
}
.gradient-blur > div:nth-of-type(1){z-index:2;backdrop-filter:blur(1px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
}
.gradient-blur > div:nth-of-type(2){z-index:3;backdrop-filter:blur(2px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
}
.gradient-blur > div:nth-of-type(3){z-index:4;backdrop-filter:blur(4px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
}
.gradient-blur > div:nth-of-type(4){z-index:5;backdrop-filter:blur(8px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
}
.gradient-blur > div:nth-of-type(5){z-index:6;backdrop-filter:blur(16px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
}
.gradient-blur > div:nth-of-type(6){z-index:7;backdrop-filter:blur(32px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
}
.gradient-blur::after{content:"";z-index:8;backdrop-filter:blur(64px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
}
.border-gradient{position:relative}
.border-gradient::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  background:linear-gradient(205deg, rgba(255,255,255,0) 0%, rgba(159,215,255,0.18) 40%, rgba(255,255,255,0) 100%);
  opacity:.9;
}
.logo-wrap{display:flex;align-items:center;gap:.6rem}
.logo-hex{width:28px;height:28px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:900;color:#000}
.logo-text{font-weight:900;letter-spacing:.12em}
.logo-text span{color:var(--gold)}
.tb-right{display:flex;align-items:center;gap:.6rem;color:var(--muted)}
.icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18);
  display:flex;align-items:center;justify-content:center;color:var(--txt);cursor:pointer;transition:transform var(--dur-1) var(--ease-out), border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)}
.icon-btn:hover{transform:translateY(-1px);border-color:rgba(159,215,255,.35);box-shadow:0 10px 30px rgba(4,13,28,.35)}
.btn{border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18);color:var(--txt);border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:800;letter-spacing:.06em}
.btn.primary{background:linear-gradient(180deg,rgba(110,194,255,.22),rgba(0,0,0,.10));border-color:rgba(110,194,255,.38);box-shadow:0 0 0 1px rgba(110,194,255,.12) inset}
.btn:disabled{opacity:.5;cursor:not-allowed}
.pill{border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18);color:var(--txt);border-radius:999px;padding:8px 10px}
select.pill{appearance:none}
.layout{flex:1;min-height:0;display:flex;gap:12px;padding:12px;overflow:hidden}
.panel{background:rgba(18,31,48,0.92);border:1px solid var(--bdr);border-radius:var(--radius-md);overflow:hidden;min-height:0}
.chart-wrap{flex:1;min-width:0;display:flex;flex-direction:column}
#chart{flex:1;min-height:0}
.chart-fade{
  mask-image:linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
  -webkit-mask-image:linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
}
.side{width:360px;flex-shrink:0;display:flex;flex-direction:column;min-height:0}
.side{transition:width var(--dur-3) var(--ease-soft), opacity var(--dur-3) var(--ease-soft)}
.focus-mode .side{width:0 !important;opacity:0;pointer-events:none;border:0}
.focus-mode .layout{gap:0}
.focus-mode .panel.side{display:none}
.ph{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg,rgba(23,39,61,.65),rgba(18,31,48,.0))}
.ph-title{font-weight:900;letter-spacing:.08em;font-size:12px;color:var(--txt)}
.ph-sub{font-size:11px;color:var(--muted)}
.content{padding:12px 14px;overflow:auto;min-height:0}
.kvs{display:grid;grid-template-columns:1fr;gap:10px}
.kv{border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.18);border-radius:12px;padding:10px 12px}
.kv .k{font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.kv .v{margin-top:6px;font-size:13px;color:var(--txt);line-height:1.42;white-space:pre-wrap;word-break:break-word}
.gauge{height:12px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:8px}
.gauge > div{height:100%;width:0;background:linear-gradient(90deg,var(--red),var(--yellow),var(--green))}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.row > *{flex:0 0 auto}
.bottom{flex-shrink:0;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px solid rgba(255,255,255,.06)}
.checks{display:flex;gap:14px;align-items:center;color:var(--muted);font-size:12px}
.checks label{display:flex;gap:8px;align-items:center;cursor:pointer}
.checks input{accent-color:var(--gold)}
.history{display:flex;flex-direction:column;gap:8px}
.history-item{border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);border-radius:12px;padding:10px 12px;cursor:pointer}
.history-item:hover{border-color:rgba(159,215,255,.25)}
.history-top{display:flex;justify-content:space-between;gap:10px;align-items:center}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);color:var(--muted)}
.badge.good{border-color:rgba(56,211,159,.35);color:var(--green)}
.badge.warn{border-color:rgba(240,194,122,.35);color:var(--yellow)}
.badge.bad{border-color:rgba(243,125,143,.35);color:var(--red)}
.small{font-size:11px;color:var(--muted);line-height:1.35}
</style>
</head>
<body>
<div class="gradient-blur"><div></div><div></div><div></div><div></div><div></div><div></div></div>
<div id="app">
  <div id="topbar" class="border-gradient">
    <div class="logo-wrap">
      <div class="logo-hex">N</div>
      <div class="logo-text">PUKITRA<span>DEV2</span></div>
    </div>
    <div class="row" style="gap:8px">
      <select id="sym" class="pill">
        <option value="BTCUSDT">BTC/USDT</option>
        <option value="ETHUSDT">ETH/USDT</option>
        <option value="SOLUSDT">SOL/USDT</option>
        <option value="BNBUSDT">BNB/USDT</option>
      </select>
      <select id="tf" class="pill">
        <option value="1d">1d</option>
        <option value="1w">1w</option>
      </select>
      <select id="range" class="pill">
        <option value="1w">1W</option>
        <option value="1m" selected>1M</option>
        <option value="3m">3M</option>
        <option value="1y">1Y</option>
        <option value="3y">3Y</option>
        <option value="all">ALL</option>
      </select>
      <button id="btnLoad" class="btn">LOAD</button>
      <button id="btnAnalyze" class="btn primary">ANALYZE CHART</button>
    </div>
    <div class="tb-right">
      <button class="icon-btn" id="btnFocus" title="Focus mode">⤢</button>
      <label class="small" style="display:flex;gap:8px;align-items:center;cursor:pointer">
        <input type="checkbox" id="logScale" style="transform:translateY(1px)"> Log
      </label>
      <a class="icon-btn" href="/" title="Back to dashboard">&#8592;</a>
    </div>
  </div>

  <div class="layout">
    <div class="panel chart-wrap border-gradient">
      <div class="ph">
        <div>
          <div class="ph-title">CHART</div>
          <div class="ph-sub" id="subtitle">--</div>
        </div>
        <div class="small" id="status">Ready</div>
      </div>
      <div id="chart" class="chart-fade"></div>
      <div class="bottom">
        <div class="checks">
          <label><input type="checkbox" id="tgPrice" checked> Price line</label>
          <label><input type="checkbox" id="tgMA" checked> MA200</label>
          <label><input type="checkbox" id="tgAI"> AI indicator</label>
        </div>
        <div class="small">Binance klines · Lightweight Charts</div>
      </div>
    </div>

    <div class="panel side border-gradient">
      <div class="ph">
        <div>
          <div class="ph-title">ANALYSIS</div>
          <div class="ph-sub" id="analysisMeta">No analysis yet</div>
        </div>
        <span class="badge" id="badgeRec">--</span>
      </div>
      <div class="content">
        <div class="kvs">
          <div class="kv"><div class="k">Cycle phase</div><div class="v" id="vPhase">--</div></div>
          <div class="kv">
            <div class="k">Cycle score</div>
            <div class="v"><span id="vScore">--</span>/100</div>
            <div class="gauge"><div id="scoreBar"></div></div>
          </div>
          <div class="kv">
            <div class="k">Confidence</div>
            <div class="v"><span id="vConf">--</span>%</div>
            <div class="gauge"><div id="confBar"></div></div>
          </div>
          <div class="kv"><div class="k">Recommendation</div><div class="v" id="vRec">--</div></div>
        <div class="kv"><div class="k">Reasoning</div><div class="v" id="vReason">--</div></div>
        <div class="kv"><div class="k">Custom indicator</div><div class="v small" id="vIndicator">--</div></div>
          <div class="kv">
            <div class="k">Key levels</div>
            <div class="v small" id="vLevels">--</div>
          </div>
        </div>

        <div style="margin-top:14px">
          <div class="ph-title" style="margin-bottom:8px">RECENT</div>
          <div class="history" id="history"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var chartEl = document.getElementById('chart');
  var symEl = document.getElementById('sym');
  var tfEl = document.getElementById('tf');
  var rangeEl = document.getElementById('range');
  var btnLoad = document.getElementById('btnLoad');
  var btnAnalyze = document.getElementById('btnAnalyze');
  var subtitle = document.getElementById('subtitle');
  var statusEl = document.getElementById('status');
  var logScaleEl = document.getElementById('logScale');
  var btnFocus = document.getElementById('btnFocus');

  var tgPrice = document.getElementById('tgPrice');
  var tgMA = document.getElementById('tgMA');
  var tgAI = document.getElementById('tgAI');

  var vPhase = document.getElementById('vPhase');
  var vScore = document.getElementById('vScore');
  var vRec = document.getElementById('vRec');
  var vConf = document.getElementById('vConf');
  var vReason = document.getElementById('vReason');
  var vIndicator = document.getElementById('vIndicator');
  var vLevels = document.getElementById('vLevels');
  var scoreBar = document.getElementById('scoreBar');
  var confBar = document.getElementById('confBar');
  var analysisMeta = document.getElementById('analysisMeta');
  var badgeRec = document.getElementById('badgeRec');
  var historyEl = document.getElementById('history');

  var chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#060d18' }, textColor: '#e5eefb', fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" },
    grid: { vertLines: { color: 'rgba(36,56,82,0.35)' }, horzLines: { color: 'rgba(36,56,82,0.35)' } },
    rightPriceScale: { borderColor: 'rgba(36,56,82,0.8)' },
    timeScale: { borderColor: 'rgba(36,56,82,0.8)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 }
  });

  var candleSeries = chart.addCandlestickSeries({
    upColor: '#38d39f', downColor: '#f37d8f',
    borderUpColor: '#38d39f', borderDownColor: '#f37d8f',
    wickUpColor: 'rgba(56,211,159,0.9)', wickDownColor: 'rgba(243,125,143,0.9)'
  });
  var priceSeries = chart.addLineSeries({ color: '#f0c27a', lineWidth: 2, priceLineVisible: false });
  var maSeries = chart.addLineSeries({ color: '#e5eefb', lineWidth: 1, priceLineVisible: false });
  var aiSeries = chart.addLineSeries({ color: '#6ec2ff', lineWidth: 2, priceLineVisible: false, visible: false });

  var currentCandles = [];
  var keyLevelLines = [];

  function setStatus(t){ statusEl.textContent = t || ''; }
  function toMs(d){ return d.getTime(); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function safeNum(x){ var n = Number(x); return Number.isFinite(n) ? n : null; }

  function rangeStartMs(rangeId){
    var now = Date.now();
    var day = 24*60*60*1000;
    if(rangeId === '1w') return now - 7*day;
    if(rangeId === '1m') return now - 30*day;
    if(rangeId === '3m') return now - 90*day;
    if(rangeId === '1y') return now - 365*day;
    if(rangeId === '3y') return now - 3*365*day;
    return 0; // all
  }

  async function fetchKlines(symbol, interval, startTime){
    var out = [];
    var next = startTime || 0;
    var loops = 0;
    while(true){
      loops++;
      if(loops > 20) break; // safety
      var qs = new URLSearchParams();
      qs.set('symbol', symbol);
      qs.set('interval', interval);
      qs.set('limit', '1000');
      if(next && next > 0) qs.set('startTime', String(next));
      var url = 'https://api.binance.com/api/v3/klines?' + qs.toString();
      var r = await fetch(url);
      if(!r.ok) throw new Error('Binance error ' + r.status);
      var arr = await r.json();
      if(!Array.isArray(arr) || arr.length === 0) break;
      out = out.concat(arr);
      if(arr.length < 1000) break;
      var lastOpen = Number(arr[arr.length - 1][0]) || 0;
      if(!lastOpen) break;
      var newNext = lastOpen + 1;
      if(newNext <= next) break;
      next = newNext;
      if(out.length >= 5000) break;
    }
    return out;
  }

  function normalizeKlines(arr){
    return arr.map(function(k){
      var t = Number(k[0]);
      return { t: t, o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) };
    }).filter(function(c){
      return Number.isFinite(c.t)&&Number.isFinite(c.o)&&Number.isFinite(c.h)&&Number.isFinite(c.l)&&Number.isFinite(c.c)&&Number.isFinite(c.v);
    });
  }

  function toCandleData(candles){
    return candles.map(function(c){
      return { time: Math.floor(c.t/1000), open: c.o, high: c.h, low: c.l, close: c.c };
    });
  }

  function toLineClose(candles){
    return candles.map(function(c){ return { time: Math.floor(c.t/1000), value: c.c }; });
  }

  function computeMA(candles, period){
    var out = [];
    var sum = 0;
    for(var i=0;i<candles.length;i++){
      sum += candles[i].c;
      if(i >= period) sum -= candles[i - period].c;
      if(i >= period - 1){
        out.push({ time: Math.floor(candles[i].t/1000), value: sum / period });
      }
    }
    return out;
  }

  function clearKeyLevels(){
    if(!keyLevelLines || keyLevelLines.length === 0) return;
    try {
      keyLevelLines.forEach(function(pl){ candleSeries.removePriceLine(pl); });
    } catch(e) {}
    keyLevelLines = [];
  }

  function setKeyLevels(levels){
    clearKeyLevels();
    if(!levels) return;
    var buy = safeNum(levels.buy_zone);
    var fair = safeNum(levels.fair_value);
    var res = safeNum(levels.resistance);
    var lines = [];
    if(buy !== null) lines.push({ price: buy, color: 'rgba(56,211,159,0.75)', title: 'Buy zone' });
    if(fair !== null) lines.push({ price: fair, color: 'rgba(240,194,122,0.80)', title: 'Fair value' });
    if(res !== null) lines.push({ price: res, color: 'rgba(243,125,143,0.75)', title: 'Resistance' });
    lines.forEach(function(l){
      var pl = candleSeries.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: l.title
      });
      keyLevelLines.push(pl);
    });
  }

  function setSeriesVisibility(){
    priceSeries.applyOptions({ visible: !!tgPrice.checked });
    maSeries.applyOptions({ visible: !!tgMA.checked });
    aiSeries.applyOptions({ visible: !!tgAI.checked });
  }

  function recBadge(rec){
    var r = String(rec || '--').toUpperCase();
    badgeRec.textContent = r;
    badgeRec.className = 'badge';
    if(r === 'BUY_ZONE') badgeRec.className = 'badge good';
    else if(r === 'SELL_ZONE') badgeRec.className = 'badge bad';
    else if(r === 'CAUTION') badgeRec.className = 'badge warn';
    else if(r === 'HOLD') badgeRec.className = 'badge warn';
  }

  function setAnalysisUI(d){
    vPhase.textContent = d.cycle_phase || '--';
    vScore.textContent = (d.cycle_score == null ? '--' : String(d.cycle_score));
    vRec.textContent = d.recommendation || '--';
    vConf.textContent = (d.confidence == null ? '--' : String(d.confidence));
    vReason.textContent = d.reasoning || '--';
    if(d.custom_indicator){
      var ci = d.custom_indicator || {};
      var name = ci.name || 'Indicator';
      var desc = ci.description || '';
      vIndicator.textContent = desc ? (name + ': ' + desc) : name;
    } else {
      vIndicator.textContent = '--';
    }
    var lv = d.key_levels || {};
    vLevels.textContent = 'Buy zone: ' + (lv.buy_zone ?? '--') + ' · Fair value: ' + (lv.fair_value ?? '--') + ' · Resistance: ' + (lv.resistance ?? '--');

    var score = clamp(Number(d.cycle_score)||0,0,100);
    var conf = clamp(Number(d.confidence)||0,0,100);
    scoreBar.style.width = score + '%';
    confBar.style.width = conf + '%';
    analysisMeta.textContent = new Date().toLocaleString();
    recBadge(d.recommendation);
  }

  function alignIndicator(values, candles){
    if(!Array.isArray(values) || !candles || candles.length === 0) return [];
    var n = candles.length;
    var vals = values.map(function(x){ return safeNum(x); });
    vals = vals.filter(function(x){ return x !== null; });
    if(vals.length === 0) return [];
    if(vals.length > n) vals = vals.slice(vals.length - n);
    if(vals.length < n){
      var pad = new Array(n - vals.length);
      for(var i=0;i<pad.length;i++) pad[i] = vals[0];
      vals = pad.concat(vals);
    }
    var out = [];
    for(var j=0;j<n;j++){
      out.push({ time: Math.floor(candles[j].t/1000), value: vals[j] });
    }
    return out;
  }

  function getHistoryKey(symbol, tf){
    return 'analysis_history_v1:' + symbol + ':' + tf;
  }

  function loadHistory(){
    var key = getHistoryKey(symEl.value, tfEl.value);
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch(e){
      return [];
    }
  }

  function saveHistory(entry){
    var key = getHistoryKey(symEl.value, tfEl.value);
    var arr = loadHistory();
    arr.unshift(entry);
    arr = arr.slice(0, 5);
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch(e){}
    renderHistory();
  }

  function renderHistory(){
    var arr = loadHistory();
    if(arr.length === 0){
      historyEl.innerHTML = '<div class="small">No saved analyses yet.</div>';
      return;
    }
    historyEl.innerHTML = '';
    arr.forEach(function(it, idx){
      var div = document.createElement('div');
      div.className = 'history-item';
      var rec = String(it.recommendation || '--').toUpperCase();
      var badge = (rec === 'BUY_ZONE') ? 'good' : (rec === 'SELL_ZONE') ? 'bad' : 'warn';
      div.innerHTML =
        '<div class="history-top">' +
          '<div style="font-weight:900;letter-spacing:.06em;font-size:12px">' + (it.cycle_phase || 'Analysis') + '</div>' +
          '<span class="badge ' + badge + '">' + rec + '</span>' +
        '</div>' +
        '<div class="small" style="margin-top:6px">' +
          (it.when || '') + ' · score ' + (it.cycle_score ?? '--') + ' · conf ' + (it.confidence ?? '--') + '%' +
        '</div>';
      div.addEventListener('click', function(){
        setAnalysisUI(it);
        setKeyLevels(it.key_levels || {});
        if(it.custom_indicator && Array.isArray(it.custom_indicator.values)){
          tgAI.checked = true;
          aiSeries.applyOptions({ visible: true, color: it.custom_indicator.color || '#6ec2ff' });
          var aligned = alignIndicator(it.custom_indicator.values, currentCandles);
          if(aligned.length > 0) aiSeries.setData(aligned);
        }
        setSeriesVisibility();
      });
      historyEl.appendChild(div);
    });
  }

  async function loadChart(){
    setStatus('Loading klines...');
    btnLoad.disabled = true;
    btnAnalyze.disabled = true;
    try {
      var symbol = symEl.value;
      var interval = tfEl.value;
      var start = rangeStartMs(rangeEl.value);
      subtitle.textContent = symbol + ' · ' + interval + ' · ' + rangeEl.options[rangeEl.selectedIndex].text;

      var raw = await fetchKlines(symbol, interval, start);
      var candles = normalizeKlines(raw);
      if(start && start > 0) candles = candles.filter(function(c){ return c.t >= start; });
      if(candles.length < 10) throw new Error('Not enough candles returned');
      currentCandles = candles;

      candleSeries.setData(toCandleData(candles));
      priceSeries.setData(toLineClose(candles));
      maSeries.setData(computeMA(candles, 200));
      aiSeries.setData([]);
      tgAI.checked = false;
      aiSeries.applyOptions({ visible: false, color: '#6ec2ff' });
      clearKeyLevels();
      setSeriesVisibility();
      chart.timeScale().fitContent();
      setStatus('Loaded ' + candles.length + ' candles');
      renderHistory();
    } finally {
      btnLoad.disabled = false;
      btnAnalyze.disabled = false;
    }
  }

  async function analyze(){
    if(!currentCandles || currentCandles.length < 50){
      alert('Load more candle data first (need at least 50).');
      return;
    }
    setStatus('Analyzing with DeepSeek...');
    btnAnalyze.disabled = true;
    try {
      var symbol = symEl.value;
      var timeframe = tfEl.value;
      var last = currentCandles.slice(Math.max(0, currentCandles.length - 200));
      var payload = { symbol: symbol, timeframe: timeframe, candles: last };
      var r = await fetch('/api/chart/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var d = await r.json();
      if(!r.ok) throw new Error(d && d.error ? d.error : ('HTTP ' + r.status));
      setAnalysisUI(d);
      setKeyLevels(d.key_levels || {});

      if(d.custom_indicator && Array.isArray(d.custom_indicator.values)){
        var color = d.custom_indicator.color || '#6ec2ff';
        var aligned = alignIndicator(d.custom_indicator.values, currentCandles);
        if(aligned.length > 0){
          aiSeries.applyOptions({ color: color, visible: true });
          aiSeries.setData(aligned);
          tgAI.checked = true;
        }
      }
      setSeriesVisibility();

      var entry = Object.assign({}, d, { when: new Date().toLocaleString() });
      saveHistory(entry);

      setStatus('Analysis complete');
    } catch(e){
      console.error(e);
      alert('Analysis failed: ' + e.message);
      setStatus('Analysis failed');
    } finally {
      btnAnalyze.disabled = false;
    }
  }

  function resize(){
    chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });
  }

  tgPrice.addEventListener('change', setSeriesVisibility);
  tgMA.addEventListener('change', setSeriesVisibility);
  tgAI.addEventListener('change', setSeriesVisibility);
  btnLoad.addEventListener('click', loadChart);
  btnAnalyze.addEventListener('click', analyze);

  logScaleEl.addEventListener('change', function(){
    chart.applyOptions({ rightPriceScale: { mode: logScaleEl.checked ? 1 : 0 } });
  });

  if(btnFocus){
    btnFocus.addEventListener('click', function(){
      document.body.classList.toggle('focus-mode');
      setTimeout(function(){ resize(); }, 50);
    });
  }

  window.addEventListener('resize', function(){ resize(); });

  // initial load
  setSeriesVisibility();
  resize();
  loadChart();
})();
</script>
</body>
</html>`;
    }

    // ── /analysis — Chart analysis page ─────────────────────────────────────
    if (url.pathname === '/analysis') {
      return new Response(renderAnalysisPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    // ── Call a single agent ─────────────────────────────────────────────────
    async function callAgent(agentId, userMsg, env) {
      const agent = AGENTS[agentId];
      const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId];
      const provider = AI_PROVIDER[agentId];
      const apiKey = env[provider.apiKeyEnvVar];
      if (!apiKey) {
        const errMsg = `${provider.apiKeyEnvVar} not configured`;
        addSystemLog('ERROR', `Agent ${agentId} failed`, { reason: errMsg });
        return { agent: agentId, recommendation: 'HOLD', confidence: 20, error: errMsg };
      }
      addSystemLog('INFO', `Calling agent: ${agentId}`, { provider: provider.provider, model: provider.model });

      try {
        let body, headers, parseContent;

        if (provider.provider === 'google') {
          // Google Gemini API format
          headers = { 'Content-Type': 'application/json' };
          body = JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + '\n\n' + userMsg }] }],
            generationConfig: { maxOutputTokens: agent.maxTokens }
          });
          parseContent = (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (provider.provider === 'deepseek') {
          // DeepSeek API format (OpenAI-compatible)
          headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          };
          body = JSON.stringify({
            model: provider.model,
            max_tokens: agent.maxTokens,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg || '' }]
          });
          parseContent = (data) => data.choices?.[0]?.message?.content || '';
        } else {
          // Default: OpenAI-compatible
          headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          };
          body = JSON.stringify({
            model: provider.model,
            max_tokens: agent.maxTokens,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg || '' }]
          });
          parseContent = (data) => data.choices?.[0]?.message?.content || '';
        }

        // Add API key to URL for Google if using URL parameter method
        let url = provider.endpoint;
        if (provider.provider === 'google') {
          url = provider.endpoint + '?key=' + apiKey;
        }

        const res = await fetch(url, { method: 'POST', headers, body });
        const data = await res.json();
        if (!res.ok) {
          const errorMsg = data.error?.message || JSON.stringify(data) || 'API error';
          addSystemLog('ERROR', `Agent ${agentId} API error`, { error: errorMsg });
          return { agent: agentId, recommendation: 'HOLD', confidence: 20, error: errorMsg };
        }

        const raw = parseContent(data);
        let parsed = { recommendation: 'HOLD', confidence: 30 };
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch (e) {
          addSystemLog('WARN', `Agent ${agentId}: Could not parse JSON response`, {});
        }
        addSystemLog('SUCCESS', `Agent ${agentId} completed`, { recommendation: parsed.recommendation, confidence: parsed.confidence });
        return { agent: agentId, confidence: parsed.confidence || 30, recommendation: parsed.recommendation || 'HOLD', raw: parsed, cached: (data.usage?.prompt_cache_hit_tokens || 0) > 0 };
      } catch (e) {
        addSystemLog('ERROR', `Agent ${agentId} exception`, { error: e.message });
        return { agent: agentId, recommendation: 'HOLD', confidence: 10, error: e.message };
      }
    }

    // ── Aggregate agent results ─────────────────────────────────────────────
    function aggregateResults(results) {
      const RISK_MAP = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
      const scores = { BUY: 0, SELL: 0, HOLD: 0 };
      let totalConfidence = 0;
      let totalWeight = 0;
      const agentDetails = {};

      results.forEach(r => {
        if (r.error && !r.raw) return;
        const agent = AGENTS[r.agent];
        const w = agent.weight;
        const rec = (r.recommendation || 'HOLD').toUpperCase();
        const conf = Math.min(100, Math.max(0, parseInt(r.confidence) || 30));
        scores[rec] += w * conf;
        totalConfidence += conf * w;
        totalWeight += w;
        agentDetails[r.agent] = { ...r.raw, confidence: conf, recommendation: rec };
      });

      const avgConfidence = totalWeight > 0 ? Math.round(totalConfidence / totalWeight) : 30;
      const finalRec = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0];

      let worstRisk = 'LOW';
      Object.values(agentDetails).forEach(d => {
        const r = (d.risk_level || 'MEDIUM').toUpperCase();
        if (RISK_MAP[r] > RISK_MAP[worstRisk]) worstRisk = r;
      });

      const tech = agentDetails.technical || {};
      const risk = agentDetails.risk || {};
      return {
        headline: `${finalRec} signal with ${avgConfidence}% confidence (aggregated from ${Object.keys(agentDetails).length} agents)`,
        recommendation: finalRec,
        confidence: avgConfidence,
        analysis: `Multi-agent analysis: Technical=${agentDetails.technical?.recommendation || '?'} (${agentDetails.technical?.confidence || 0}%), Sentiment=${agentDetails.sentiment?.recommendation || '?'} (${agentDetails.sentiment?.confidence || 0}%), Fundamental=${agentDetails.fundamental?.recommendation || '?'} (${agentDetails.fundamental?.confidence || 0}%), Risk=${agentDetails.risk?.recommendation || '?'} (${agentDetails.risk?.confidence || 0}%), Portfolio=${agentDetails.portfolio?.recommendation || '?'} (${agentDetails.portfolio?.confidence || 0}%).`,
        bullish_factors: tech.technical_signals || [],
        bearish_factors: [],
        risk_level: worstRisk,
        entry_zone: tech.entry_zone || risk.stop_loss || 'N/A',
        stop_loss: risk.stop_loss || tech.stop_loss || 'N/A',
        target: tech.target || 'N/A',
        timeframe: tech.timeframe || '24-48h',
        agents: agentDetails
      };
    }

    // ── Call intelligence agent for trade explanation ─────────────────────
    async function callIntelligenceAgent(aggregation, env) {
      const intelligencePrompt = `Analyze this multi-agent trading consensus:

AGGREGATED RECOMMENDATION
- Decision: ${aggregation.recommendation}
- Confidence: ${aggregation.confidence}%
- Risk Level: ${aggregation.risk_level}

INDIVIDUAL AGENT VOTES
- Technical: ${aggregation.agents?.technical?.recommendation || '?'} (${aggregation.agents?.technical?.confidence || 0}%)
- Sentiment: ${aggregation.agents?.sentiment?.recommendation || '?'} (${aggregation.agents?.sentiment?.confidence || 0}%)
- Fundamental: ${aggregation.agents?.fundamental?.recommendation || '?'} (${aggregation.agents?.fundamental?.confidence || 0}%)
- Risk: ${aggregation.agents?.risk?.recommendation || '?'} (${aggregation.agents?.risk?.confidence || 0}%)
- Portfolio: ${aggregation.agents?.portfolio?.recommendation || '?'} (${aggregation.agents?.portfolio?.confidence || 0}%)

TRADE PARAMETERS
- Entry Zone: ${aggregation.entry_zone}
- Stop Loss: ${aggregation.stop_loss}
- Target: ${aggregation.target}
- Timeframe: ${aggregation.timeframe}

Explain why this recommendation emerged. Flag any surprises, conflicts, or red flags the CIO should know.`;

      return await callAgent('intelligence', intelligencePrompt, env);
    }

    // ── Call execution agent for final CIO approval ────────────────────────
    async function callExecutionAgent(aggregation, intelligence, symbol, price, env) {
      const executionPrompt = `TRADE RECOMMENDATION FOR ${symbol}/USDT @ $${price}:

RECOMMENDATION
- Decision: ${aggregation.recommendation}
- Confidence: ${aggregation.confidence}%
- Risk Level: ${aggregation.risk_level}

AGENT CONSENSUS
- Technical: ${aggregation.agents?.technical?.recommendation || '?'} (${aggregation.agents?.technical?.confidence || 0}%)
- Sentiment: ${aggregation.agents?.sentiment?.recommendation || '?'} (${aggregation.agents?.sentiment?.confidence || 0}%)
- Fundamentals: ${aggregation.agents?.fundamental?.recommendation || '?'} (${aggregation.agents?.fundamental?.confidence || 0}%)

TRADE DETAILS
- Entry Zone: ${aggregation.entry_zone}
- Stop Loss: ${aggregation.stop_loss}
- Target: ${aggregation.target}
- Portfolio Allocation: ${aggregation.agents?.portfolio?.recommendation || 'N/A'}

INTELLIGENCE ANALYSIS
- Consensus Quality: ${intelligence?.raw?.consensus_quality || 'MODERATE'}
- Key Insight: ${intelligence?.raw?.key_insight || 'N/A'}
- Red Flags: ${(intelligence?.raw?.red_flags || []).join(', ') || 'None'}
- Conflicts: ${(intelligence?.raw?.conflicts || []).join(', ') || 'None'}

As Chief Investment Officer, review the complete analysis above. Approve (EXECUTE), reject (SKIP), or request modifications (MODIFY). Be conservative — when in doubt, skip the trade.`;

      return await callAgent('execution', executionPrompt, env);
    }

    // ── Run all agents in parallel ─────────────────────────────────────────
    async function runAllAgents(p, env) {
      const symbol  = p.get('symbol')     || 'BTC';
      const price   = p.get('price')      || '43250';
      const change  = p.get('change')      || '0';
      const rsi     = p.get('rsi')        || '50';
      const macd    = p.get('macd')       || '0';
      const sig     = p.get('signal')     || 'HOLD';
      const conf    = p.get('confidence') || '70';
      const vol     = p.get('volume')     || '30000';
      const high    = p.get('high24')     || '44500';
      const low     = p.get('low24')      || '42000';
      const bbpos   = p.get('bb_pos')     || '50';

      console.log('📊 runAllAgents called for', symbol);
      console.log('Available agents:', Object.keys(AGENTS));

      const baseData = `Symbol: ${symbol}/USDT | Price: $${price} | 24h Change: ${change}%
24h High: $${high} | 24h Low: $${low} | Volume: ${(Number(vol)/1000).toFixed(1)}K USDT
RSI(14): ${rsi} | MACD: ${macd} | Bollinger Band Position: ${bbpos}%
Current signal: ${sig} at ${conf}% confidence`;

      const agentPrompts = {
        technical:   `${baseData}\n\nFocus: chart patterns, indicator divergence, trend strength, volume, key support/resistance. Provide specific entry, stop loss, and price targets.`,
        sentiment:   `${baseData}\n\nFocus: market mood, fear/greed narrative, social media signal intensity, news catalysts. Assess whether the market is risk-on or risk-off.`,
        fundamental: `${baseData}\n\nFocus: ${symbol} project fundamentals, tokenomics health, team activity, on-chain metrics. Evaluate long-term viability.`,
        risk:       `Symbol: ${symbol}/USDT | Price: $${price} | 24h High: $${high} | 24h Low: $${low}\n\nAs risk manager: calculate maximum safe position size (never >2% risk), appropriate stop-loss level given recent volatility, and overall portfolio exposure limit.`,
        portfolio:  `Symbol: ${symbol}/USDT | Price: $${price} | Current market: ${sig} signal at ${conf}% confidence\n\nAs portfolio optimizer: assess what % of portfolio this position should represent, whether rebalancing is needed, and overall diversification impact.`
      };

      // Exclude execution agent from initial parallel run — it runs AFTER aggregation
      const agentIds = Object.keys(AGENTS).filter(id => id !== 'execution');
      console.log(`🚀 Starting ${agentIds.length} agents:`, agentIds);
      const results = await Promise.all(agentIds.map(id => callAgent(id, agentPrompts[id], env)));
      console.log('📋 Agent results:', results);
      return results;
    }

    // ── /api/analyze — Multi-agent market analysis ──────────────────────────
    if (url.pathname === '/api/analyze') {
      const claudeKey = env.DEEPSEEK_API_KEY;
      if (!claudeKey) {
        return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured. Run: npx wrangler secret put DEEPSEEK_API_KEY' }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }

      try {
        const agentResults = await runAllAgents(url.searchParams, env);
        const aggregated = aggregateResults(agentResults);
        const anyCached = agentResults.some(r => r.cached);

        // Store intelligence report in logs
        const report = {
          timestamp: new Date().toISOString(),
          symbol: url.searchParams.get('symbol') || 'BTC',
          ...aggregated,
          cached: anyCached
        };
        intelligenceLogs.unshift(report);
        if (intelligenceLogs.length > MAX_LOGS) intelligenceLogs.pop();

        return new Response(JSON.stringify({ ...aggregated, cached: anyCached }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public,max-age=30' }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
    }

    // ── /api/chart/analyze — DeepSeek chart analysis (JSON only) ────────────
    if (url.pathname === '/api/chart/analyze') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
      }
      const apiKey = env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured. Run: npx wrangler secret put DEEPSEEK_API_KEY' }), { status: 400, headers: CORS });
      }
      try {
        const body = await request.json();
        const symbol = String(body?.symbol || '').trim();
        const timeframe = String(body?.timeframe || '').trim();
        const candles = body?.candles;

        if (!symbol || !timeframe) {
          return new Response(JSON.stringify({ error: 'Missing symbol or timeframe' }), { status: 400, headers: CORS });
        }
        if (!Array.isArray(candles) || candles.length < 50 || candles.length > 200) {
          return new Response(JSON.stringify({ error: 'candles must be an array length 50–200' }), { status: 400, headers: CORS });
        }
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i] || {};
          const ok =
            Number.isFinite(Number(c.t)) &&
            Number.isFinite(Number(c.o)) &&
            Number.isFinite(Number(c.h)) &&
            Number.isFinite(Number(c.l)) &&
            Number.isFinite(Number(c.c)) &&
            Number.isFinite(Number(c.v));
          if (!ok) {
            return new Response(JSON.stringify({ error: `Invalid candle at index ${i}` }), { status: 400, headers: CORS });
          }
        }

        const systemPrompt = `You are a crypto market cycle analyst. Analyze OHLCV data and return ONLY valid JSON.

Return ONLY a single JSON object (no markdown, no code fences) with this schema:
{
  "cycle_phase": "ACCUMULATION"|"MARKUP"|"DISTRIBUTION"|"MARKDOWN",
  "cycle_score": number, // 0-100
  "custom_indicator": {
    "name": string,
    "description": string,
    "values": number[],  // aligned to provided candles
    "color": string      // hex color like "#6ec2ff"
  },
  "key_levels": {
    "buy_zone": number,
    "fair_value": number,
    "resistance": number
  },
  "recommendation": "BUY_ZONE"|"HOLD"|"CAUTION"|"SELL_ZONE",
  "confidence": number, // 0-100
  "reasoning": string
}

Rules:
- Be conservative. If unclear, use HOLD with lower confidence.
- key_levels must be plausible and within recent price range.
- custom_indicator.values must be numeric and the same length as candles (or close; do not return empty).`;

        const userMsg = JSON.stringify({ symbol, timeframe, candles });
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            max_tokens: 1200,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMsg }
            ]
          })
        });
        const data = await res.json();
        if (!res.ok) {
          const errorMsg = data?.error?.message || JSON.stringify(data) || 'API error';
          return new Response(JSON.stringify({ error: errorMsg }), { status: 502, headers: CORS });
        }
        const raw = data?.choices?.[0]?.message?.content || '';
        let parsed = null;
        try {
          const match = String(raw).match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch (e) {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') {
          return new Response(JSON.stringify({ error: 'Could not parse JSON from model response' }), { status: 502, headers: CORS });
        }
        return new Response(JSON.stringify(parsed), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: CORS });
      }
    }

    // ── /api/intelligence-logs — Get market intelligence reports ────────────
    if (url.pathname === '/api/intelligence-logs') {
      const limit = parseInt(url.searchParams.get('limit')) || 50;
      const logs = intelligenceLogs.slice(0, limit);
      return new Response(JSON.stringify({ logs, total: intelligenceLogs.length }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/system-logs — Get all system events and actions ────────────────
    if (url.pathname === '/api/system-logs') {
      const limit = parseInt(url.searchParams.get('limit')) || 100;
      const logs = systemLogs.slice(0, limit);
      return new Response(JSON.stringify({ logs, total: systemLogs.length }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/login — Authenticate user ─────────────────────────────────────
    if (url.pathname === '/api/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { username, password } = body;

        // Validate credentials from environment variables
        const validUser = env.LOGIN_USER || 'trader';
        const validPass = env.LOGIN_PASS || 'change-me-in-production';

        if (username === validUser && password === validPass) {
          const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          return new Response(JSON.stringify({
            success: true,
            token: token,
            user: validUser
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid credentials'
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ── /api/logout — Clear session ────────────────────────────────────────
    if (url.pathname === '/api/logout') {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/settings — Store/retrieve settings in KV ────────────────────────
    if (url.pathname === '/api/settings') {
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          await env.SETTINGS.put('bitget_api_key', body.bitget_api_key || '');
          await env.SETTINGS.put('bitget_api_secret', body.bitget_api_secret || '');
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } else if (request.method === 'GET') {
        try {
          const key = await env.SETTINGS.get('bitget_api_key');
          const secret = await env.SETTINGS.get('bitget_api_secret');
          return new Response(JSON.stringify({
            bitget_api_key: key || '',
            bitget_api_secret: secret || ''
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
    }

    // ── /api/bitget/balance — Get Bitget account balance ───────────────────
    if (url.pathname === '/api/bitget/balance') {
      const balance = await getBalance(env);
      return new Response(JSON.stringify(balance), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/bitget/price — Get Bitget ticker price ────────────────────────
    if (url.pathname === '/api/bitget/price') {
      try {
        const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
        const res = await fetch(`https://api.bitget.com/spot/v1/public/tickers?symbol=${symbol}`);
        const data = await res.json();

        if (data.code === '00000' && data.data && data.data[0]) {
          const tick = data.data[0];
          return new Response(JSON.stringify({
            success: true,
            symbol: symbol,
            price: parseFloat(tick.last),
            change24h: parseFloat(tick.changeUtc) || 0,
            high24: parseFloat(tick.high24h),
            low24: parseFloat(tick.low24h),
            volume: parseFloat(tick.baseVolume)
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response(JSON.stringify({ error: 'Invalid response from Bitget' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ── /api/bitget/orders — Get open orders on Bitget ────────────────────
    if (url.pathname === '/api/bitget/orders') {
      const orders = await getOpenOrders(env);
      return new Response(JSON.stringify(orders), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/bitget/trades — Get trade history ────────────────────────────
    if (url.pathname === '/api/bitget/trades') {
      return new Response(JSON.stringify({ trades: tradingState.tradesLog }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/bitget/close-all — Close all positions (panic button) ─────────
    if (url.pathname === '/api/bitget/close-all' && request.method === 'POST') {
      const result = await cancelAllOrders(env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── /api/agents — All agents in parallel (raw output) ──────────────────
    if (url.pathname === '/api/agents') {
      const claudeKey = env.DEEPSEEK_API_KEY;
      if (!claudeKey) {
        return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
      try {
        const results = await runAllAgents(url.searchParams, env);
        return new Response(JSON.stringify({ agents: results, timestamp: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
    }

    // ── /api/test-agent — Debug single agent call ──────────────────────────
    if (url.pathname === '/api/test-agent') {
      try {
        const agentToTest = url.searchParams.get('agent') || 'technical';
        const testMsg = agentToTest === 'execution'
          ? 'TRADE RECOMMENDATION FOR BTC/USDT @ $43250:\n\nDecision: BUY\nConfidence: 75%\nRisk Level: MEDIUM\n\nTechnical: BUY (78%)\nSentiment: BUY (72%)\nFundamentals: HOLD (65%)\nRisk: Stop Loss $42000 | Target $45000\nPortfolio: Recommend 15% allocation\n\nAs Chief Investment Officer, approve (EXECUTE), reject (SKIP), or request modifications (MODIFY). Be conservative.'
          : 'Symbol: BTC/USDT | Price: $43250 | 24h Change: 2.5%\nTest message to see if agent can respond.';
        const result = await callAgent(agentToTest, testMsg, env);
        return new Response(JSON.stringify({ success: true, agent: agentToTest, result }, null, 2), {
          headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
          headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }
        });
      }
    }

    // ── /api/agent/:id — Single agent direct access ────────────────────────
    const agentMatch = url.pathname.match(/^\/api\/agent\/(\w+)$/);
    if (agentMatch) {
      const agentId = agentMatch[1];
      if (!AGENTS[agentId]) {
        return new Response(JSON.stringify({ error: `Unknown agent: ${agentId}. Valid: ${Object.keys(AGENTS).join(', ')}` }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
      const claudeKey = env.DEEPSEEK_API_KEY;
      if (!claudeKey) {
        return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
      const p = url.searchParams;
      const symbol = p.get('symbol') || 'BTC';
      const price  = p.get('price')  || '43250';
      const userMsg = `Symbol: ${symbol}/USDT at $${price}. ${p.get('context') || 'Provide your analysis.'}`;
      try {
        const result = await callAgent(agentId, userMsg, env);
        return new Response(JSON.stringify({ ...result, agent: agentId, timestamp: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' } });
      }
    }

    // ── helpers ────────────────────────────────────────────────────────────

    // ── /api/candles ───────────────────────────────────────────────────────
    if (url.pathname === '/api/candles') {
      const symbol   = url.searchParams.get('symbol')   || 'BTCUSDT';
      const interval = url.searchParams.get('interval') || '15m';
      const limit    = url.searchParams.get('limit')    || '60';
      try {
        // Fetch from Binance API
        const res  = await fetch(
          'https://api.binance.com/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit
        );
        const data = await res.json();
        if(!data || !Array.isArray(data) || data.length === 0) {
          return new Response(JSON.stringify({ error: 'No candle data from Binance' }), { status: 502, headers: CORS });
        }
        // Binance format: [time, open, high, low, close, volume, ...]
        const candles = data.map(k => ({ t:parseInt(k[0]), o:parseFloat(k[1]), h:parseFloat(k[2]), l:parseFloat(k[3]), c:parseFloat(k[4]), v:parseFloat(k[5]) }));
        return new Response(JSON.stringify(candles), { headers: {...CORS, 'Cache-Control':'public,max-age=5'} });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
      }
    }

    // ── /api/ticker ────────────────────────────────────────────────────────
    if (url.pathname === '/api/ticker') {
      try {
        const syms = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','MATICUSDT','LINKUSDT','LTCUSDT'];
        // Fetch from Binance API (24h ticker data for all symbols)
        const res  = await fetch(
          'https://api.binance.com/api/v3/ticker/24hr'
        );
        const data = await res.json();
        if(!data || !Array.isArray(data)) {
          return new Response(JSON.stringify({ error: 'No ticker data from Binance' }), { status: 502, headers: CORS });
        }
        const result = {};
        data.forEach(t => {
          // Only include the symbols we care about
          if(syms.includes(t.symbol)) {
            result[t.symbol] = {
              price: parseFloat(t.lastPrice),
              change: parseFloat(t.priceChangePercent || 0),
              high: parseFloat(t.highPrice || 0),
              low: parseFloat(t.lowPrice || 0),
              volume: parseFloat(t.quoteAssetVolume || 0)
            };
          }
        });
        return new Response(JSON.stringify(result), { headers: {...CORS, 'Cache-Control':'public,max-age=5'} });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
      }
    }

    // ── /api/prediction ────────────────────────────────────────────────────
    if (url.pathname === '/api/prediction') {
      try {
        // Get trading symbol and real market data from Binance
        const tradingSymbol = (await env.SETTINGS.get('tradingSymbol')) || 'BTCUSDT';
        const baseSymbol = tradingSymbol.replace('USDT', '');
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + tradingSymbol);
        const data = await res.json();
        if (!data || !data.lastPrice) {
          return new Response(JSON.stringify({ error: 'Failed to fetch market data' }), { status: 502, headers: CORS });
        }
        const price = parseFloat(data.lastPrice);
        const volume = data.quoteAssetVolume ? parseFloat(data.quoteAssetVolume) : 30000;

        // Run real multi-agent analysis
        const p = new URLSearchParams({
          symbol: baseSymbol,
          price: price.toString(),
          change: (parseFloat(data.priceChangePercent) || 0).toString(),
          signal: 'HOLD',
          confidence: '50',
          volume: volume.toString(),
          high24: (parseFloat(data.highPrice) || price).toString(),
          low24: (parseFloat(data.lowPrice) || price).toString(),
          rsi: '50',
          macd: '0',
          bb_pos: '50'
        });
        const agentResults = await runAllAgents(p, env);
        const agg = aggregateResults(agentResults);

        // Extract technical indicators from the aggregated results
        const tech = agg.agents?.technical || {};
        const risk = agg.agents?.risk || {};

        return new Response(JSON.stringify({
          sig: agg.recommendation,
          price: price,
          confidence: agg.confidence,
          rsi: parseFloat(tech.rsi) || 50,
          macd: tech.macd_signal || '0',
          ema20: tech.ema20 || price.toFixed(2),
          bb_pos: tech.bb_position || 50,
          volume: volume,
          risk_level: agg.risk_level,
          stop_loss: agg.stop_loss,
          take_profit: agg.target,
          agents: agg.agents,
          ts: new Date().toISOString()
        }), { headers: CORS });
      } catch(e) {
        console.error('Prediction analysis failed:', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
      }
    }

    // ── /api/settings/symbol — Get current trading symbol ────────────────
    if (url.pathname === '/api/settings/symbol' && request.method === 'GET') {
      const sym = (await env.SETTINGS.get('tradingSymbol')) || 'BTCUSDT';
      return new Response(JSON.stringify({ symbol: sym }), { headers: CORS });
    }

    // ── /api/settings/symbol — Set trading symbol ────────────────────────
    if (url.pathname === '/api/settings/symbol' && request.method === 'POST') {
      try {
        const { symbol } = await request.json();
        const allowed = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT',
          'ADAUSDT','AVAXUSDT','LINKUSDT','LTCUSDT','PEPEUSDT','WIFUSDT','TONUSDT','DOTUSDT','MATICUSDT'];
        if (!allowed.includes(symbol)) {
          return new Response(JSON.stringify({ error: 'Invalid symbol' }), { status: 400, headers: CORS });
        }
        await env.SETTINGS.put('tradingSymbol', symbol);
        return new Response(JSON.stringify({ success: true, symbol }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: CORS });
      }
    }

    // ── /api/bot/status — Get kill switch status ────────────────────────────
    if (url.pathname === '/api/bot/status' && request.method === 'GET') {
      const enabled = (await env.SETTINGS.get('botEnabled')) !== 'false';
      return new Response(JSON.stringify({ enabled }), { headers: CORS });
    }

    // ── /api/bot/toggle — Toggle kill switch ────────────────────────────────
    if (url.pathname === '/api/bot/toggle' && request.method === 'POST') {
      try {
        const current = (await env.SETTINGS.get('botEnabled')) !== 'false';
        const newState = !current;
        await env.SETTINGS.put('botEnabled', newState ? 'true' : 'false');
        return new Response(JSON.stringify({ enabled: newState }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: CORS });
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pukitradev2 - AI Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
:root{
  --bg:#060d18;--surf:#0d1726;--card:#121f30;--card2:#17273d;
  --bdr:#243852;--bdr2:#325072;--txt:#e5eefb;--muted:#90a5c2;
  --gold:#6ec2ff;--gold2:#9fd7ff;--cyan:#7fd4ff;
  --green:#38d39f;--red:#f37d8f;--yellow:#f0c27a;
  --gold-glow:rgba(110,194,255,0.28);
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;
  --radius-sm:8px;--radius-md:12px;--radius-lg:16px;
  /* Motion tokens */
  --ease-out:cubic-bezier(.22,1,.36,1);
  --ease-soft:cubic-bezier(.2,.9,.2,1);
  --dur-1:140ms;
  --dur-2:220ms;
  --dur-3:420ms;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-size:13px}
body{
  background:var(--bg);color:var(--txt);
  font-family:Inter,'Segoe UI',system-ui,sans-serif;
  letter-spacing:.01em;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  overflow:hidden;        /* prevent body scroll — each panel scrolls itself */
}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:radial-gradient(ellipse 70% 50% at 50% 0%,rgba(54,111,170,0.22) 0%,transparent 70%),linear-gradient(var(--bdr) 1px,transparent 1px),linear-gradient(90deg,var(--bdr) 1px,transparent 1px);
  background-size:auto,64px 64px,64px 64px;opacity:.09;
  mask-image:radial-gradient(ellipse 80% 80% at 50% 0%,black 40%,transparent 100%)}
body::after{
  content:'';position:fixed;inset:-20%;pointer-events:none;z-index:0;
  background:radial-gradient(circle at 22% 18%, rgba(126,203,255,0.08) 0%, transparent 34%),
             radial-gradient(circle at 78% 70%, rgba(56,211,159,0.05) 0%, transparent 38%);
  filter:blur(6px);
  animation:ambientDrift 18s ease-in-out infinite alternate;
}
@keyframes ambientDrift{
  0%{transform:translate3d(0,0,0) scale(1)}
  100%{transform:translate3d(0,-10px,0) scale(1.03)}
}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--surf)}
::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:4px}

/* Reduced motion: keep content visible, disable ambient motion */
@media (prefers-reduced-motion: reduce){
  body::after{animation:none !important}
  .status-dot{animation:none !important}
  .ring{animation:none !important}
  #tab-dashboard.active #grid .col,
  #tab-dashboard.active #bottom{animation:none !important}
  .reveal-up{opacity:1 !important;transform:none !important;transition:none !important}
  .reveal-up.in{opacity:1 !important;transform:none !important}
}

/* Apple-like glass edge blur */
.gradient-blur{position:fixed;z-index:0;inset:0 0 auto 0;height:12%;pointer-events:none;opacity:.95}
.gradient-blur > div,.gradient-blur::before,.gradient-blur::after{position:absolute;inset:0}
.gradient-blur::before{content:"";z-index:1;backdrop-filter:blur(.5px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
}
.gradient-blur > div:nth-of-type(1){z-index:2;backdrop-filter:blur(1px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
}
.gradient-blur > div:nth-of-type(2){z-index:3;backdrop-filter:blur(2px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
}
.gradient-blur > div:nth-of-type(3){z-index:4;backdrop-filter:blur(4px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
}
.gradient-blur > div:nth-of-type(4){z-index:5;backdrop-filter:blur(8px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
}
.gradient-blur > div:nth-of-type(5){z-index:6;backdrop-filter:blur(16px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
}
.gradient-blur > div:nth-of-type(6){z-index:7;backdrop-filter:blur(32px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
}
.gradient-blur::after{content:"";z-index:8;backdrop-filter:blur(64px);
  -webkit-mask:linear-gradient(to top, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
  mask:linear-gradient(to top, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
}

.border-gradient{position:relative}
.border-gradient::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  background:linear-gradient(205deg, rgba(255,255,255,0) 0%, rgba(159,215,255,0.16) 40%, rgba(255,255,255,0) 100%);
  opacity:.9;
}

/* Loader auto-hides after 1.5s even if JS fails */
@keyframes autoHide{0%,80%{opacity:1}100%{opacity:0;pointer-events:none}}
#loader{animation:autoHide 1.5s ease forwards}

/* App fills the full viewport, nothing overflows */
#app{
  position:relative;z-index:1;
  display:none;flex-direction:column;
  height:100vh;           /* exact viewport height */
  overflow:hidden;
}

/* Every tab panel fills all remaining space */
.tab-panel{display:none}
.tab-panel.active{
  display:flex;flex-direction:column;
  flex:1;min-height:0;overflow:hidden;
}

/* Dashboard inner layout */
#tab-dashboard{flex:1;min-height:0}
#strip{flex-shrink:0}
#grid{flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden}
#bottom{flex-shrink:0}

/* TOPBAR */
#topbar{display:flex;align-items:center;justify-content:space-between;padding:0 1.5rem;
  background:linear-gradient(180deg,rgba(18,31,48,0.94),rgba(13,23,38,0.88));border-bottom:1px solid var(--bdr);backdrop-filter:blur(10px);min-height:54px}
.logo-wrap{display:flex;align-items:center;gap:.6rem}
.logo-hex{width:28px;height:28px;border-radius:50%;
  background:var(--gold);
  display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:900;color:#000}
.logo-text{font-size:.98rem;font-weight:800;letter-spacing:.08em;color:#fff}
.logo-text span{color:var(--gold)}
.tb-center{display:flex;align-items:center;gap:1.5rem}
.tb-pair{display:flex;flex-direction:column;align-items:center;cursor:pointer;
  padding:.3rem .65rem;border-radius:10px;transition:background .2s,border-color .2s; border:1px solid transparent}
.tb-pair:hover,.tb-pair.active{background:rgba(127,212,255,0.08);border-color:rgba(127,212,255,0.22)}
.tb-pair.active .tb-sym{color:var(--gold)}
.tb-sym{font-size:.65rem;color:var(--muted);font-weight:700;letter-spacing:.1em}
.tb-val{font-size:.85rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.tb-chg{font-size:.6rem;font-weight:600}
.pos{color:var(--green)}.neg{color:var(--red)}
.tb-right{display:flex;align-items:center;gap:.8rem}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--red);
  box-shadow:0 0 8px var(--red);animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
#clock{font-size:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.icon-btn{width:30px;height:30px;border-radius:8px;border:1px solid var(--bdr);
  background:var(--card);color:var(--muted);cursor:pointer;
  display:flex;align-items:center;justify-content:center;font-size:.85rem;
  transition:transform var(--dur-1) var(--ease-out), border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out)}
.icon-btn:hover{border-color:var(--gold);color:var(--gold);box-shadow:0 4px 14px rgba(110,194,255,0.16)}

/* STRIP */
#strip{display:flex;align-items:center;border-bottom:1px solid var(--bdr);
  background:var(--surf);overflow-x:auto;scrollbar-width:none}
#strip::-webkit-scrollbar{display:none}
.strip-item{display:flex;align-items:center;gap:.6rem;padding:.25rem 1.2rem;
  white-space:nowrap;border-right:1px solid var(--bdr);min-width:fit-content}
.strip-sym{font-size:.65rem;color:var(--muted);font-weight:700;letter-spacing:.1em}
.strip-price{font-size:.8rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.strip-chg{font-size:.65rem;font-weight:600}

/* GRID */
/* #grid defined above in layout section */
.col{background:var(--bg);display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--bdr);min-height:0}
.col:last-child{border-right:none}
/* Column drag handle */
.col-resizer{
  width:5px;flex-shrink:0;background:var(--bdr);cursor:col-resize;
  position:relative;z-index:20;transition:background .15s;
}
.col-resizer:hover,.col-resizer.rz-active{background:var(--gold);box-shadow:0 0 8px var(--gold-glow)}
.col-resizer::after{
  content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:1px;height:30px;background:currentColor;opacity:.4;
}
/* Row drag handle */
.row-resizer{
  height:5px;flex-shrink:0;background:var(--bdr);cursor:row-resize;
  transition:background .15s;
}
.row-resizer:hover,.row-resizer.rz-active{background:var(--gold);box-shadow:0 0 8px var(--gold-glow)}
.panel{padding:var(--space-4);border-bottom:1px solid var(--bdr);flex-shrink:0;transition:border-color .2s,box-shadow .2s}
.panel:hover{border-color:var(--bdr2);box-shadow:0 8px 24px rgba(4,13,28,0.45),inset 0 0 0 1px rgba(127,212,255,0.1)}
.panel:last-child{border-bottom:none;flex:1}
.ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem}
.ph-title{font-size:.62rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;
  color:var(--muted);display:flex;align-items:center;gap:.4rem}
.ph-title::before{content:'';width:3px;height:10px;border-radius:2px;
  background:var(--gold);box-shadow:0 0 6px rgba(110,194,255,0.4)}
.ph-badge{font-size:.6rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;
  background:var(--card2);color:var(--muted);letter-spacing:.06em}

/* LEFT */
.acct-hero{background:linear-gradient(145deg,#16273d,#1a2f48);border:1px solid #2f4f73;
  border-radius:var(--radius-md);padding:1rem;margin-bottom:.85rem}
.acct-label{font-size:.6rem;color:#9ec4ee;text-transform:uppercase;letter-spacing:.12em}
.acct-val{font-size:2.05rem;font-weight:800;color:var(--gold2);font-variant-numeric:tabular-nums;line-height:1.08}
.acct-sub{font-size:.72rem;color:var(--muted);margin-top:.28rem}
.kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.kpi{background:var(--card2);border:1px solid var(--bdr);border-radius:var(--radius-sm);padding:.55rem .65rem}
.kpi-l{font-size:.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
.kpi-v{font-size:1rem;font-weight:700;color:#fff;margin-top:.2rem;font-variant-numeric:tabular-nums}
.kpi-v.g{color:var(--green)}.kpi-v.r{color:var(--red)}.kpi-v.gold{color:var(--gold)}
.flow-wrap{margin-top:.5rem}
.flow-label{display:flex;justify-content:space-between;font-size:.65rem;margin-bottom:.3rem}
.flow-track{height:8px;border-radius:4px;background:var(--bdr);overflow:hidden;display:flex}
.flow-buy{height:100%;background:linear-gradient(90deg,var(--green),#00c85a);transition:width .5s}
.flow-sell{height:100%;background:linear-gradient(90deg,#c81040,var(--red));transition:width .5s}
.spark-row{display:flex;flex-direction:column;gap:.35rem}
.spark-item{display:flex;align-items:center;gap:.5rem;background:var(--card2);
  border-radius:7px;padding:.4rem .6rem;border:1px solid var(--bdr)}
.spark-sym{font-size:.65rem;font-weight:700;color:var(--muted);min-width:36px}
.spark-price{font-size:.75rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;flex:1;text-align:right}
.spark-canvas{width:60px;height:22px}

/* CENTER */
.chart-header{display:flex;align-items:center;gap:1rem;padding:.85rem 1rem .65rem;
  border-bottom:1px solid var(--bdr);background:linear-gradient(180deg,#121f30,#101c2c)}
.ch-price{font-size:2.55rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;line-height:1;transition:color .3s}
.ch-change{font-size:.88rem;font-weight:600}
.ch-label{font-size:.68rem;color:var(--muted);margin-left:auto;text-align:right}
.ch-label strong{display:block;color:#fff;font-size:.8rem}
.tf-row{display:flex;align-items:center;gap:.3rem;padding:.5rem 1rem;
  border-bottom:1px solid var(--bdr);background:var(--surf)}
.tf{font-size:.65rem;font-weight:700;letter-spacing:.08em;padding:.2rem .55rem;
  border-radius:5px;cursor:pointer;background:transparent;color:var(--muted);
  border:1px solid transparent;transition:all .15s}
.tf.on{background:var(--gold);color:#000;border-color:var(--gold)}
.tf:hover:not(.on){color:var(--gold);border-color:var(--bdr2)}
.chart-sep{width:1px;background:var(--bdr);margin:0 .2rem;height:16px}
.chart-body{flex:1;position:relative;overflow:hidden;min-height:200px}
.chart-fade{
  mask-image:linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
  -webkit-mask-image:linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
}
#mainChart{position:absolute;inset:0;width:100%;height:100%}

/* RIGHT */
.sig-hero{position:relative;overflow:hidden;border-radius:12px;padding:1rem;
  margin-bottom:.75rem;transition:background .4s,border-color .4s,box-shadow .35s}
.sig-hero.BUY{background:radial-gradient(circle at 30% 50%,#173a34,#112a27);border:1px solid var(--green)}
.sig-hero.SELL{background:radial-gradient(circle at 30% 50%,#3a1b2a,#241520);border:1px solid var(--red)}
.sig-hero.HOLD{background:radial-gradient(circle at 30% 50%,#3b3420,#28231a);border:1px solid var(--yellow)}
.sig-hero:hover{box-shadow:0 10px 26px rgba(4,13,28,0.45)}
.ring-wrap{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:80px;height:80px}
.ring{position:absolute;border-radius:50%;border:1.5px solid;
  animation:expand 2.4s ease-out infinite;
  top:50%;left:50%;transform:translate(-50%,-50%);width:100%;height:100%}
.ring:nth-child(2){animation-delay:.8s}
.ring:nth-child(3){animation-delay:1.6s}
.BUY .ring{border-color:var(--green)}
.SELL .ring{border-color:var(--red)}
.HOLD .ring{border-color:var(--yellow)}
@keyframes expand{
  0%{transform:translate(-50%,-50%) scale(.3);opacity:.8}
  100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}}
.sig-label{font-size:.58rem;color:rgba(255,255,255,.45);font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.sig-word{font-size:2.7rem;font-weight:900;letter-spacing:.02em;line-height:1.04;margin:.14rem 0}
.BUY .sig-word{color:var(--green);text-shadow:0 0 14px rgba(56,211,159,0.28)}
.SELL .sig-word{color:var(--red);text-shadow:0 0 14px rgba(243,125,143,0.24)}
.HOLD .sig-word{color:var(--yellow);text-shadow:0 0 14px rgba(240,194,122,0.24)}
.sig-price{font-size:.8rem;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums}
.gauge-wrap{display:flex;flex-direction:column;align-items:center;margin:.25rem 0}
.gauge-svg{width:110px;height:66px;overflow:visible}
.chips{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.42rem}
.chip{background:var(--card2);border:1px solid var(--bdr);border-radius:var(--radius-sm);padding:.5rem .52rem;text-align:center}
.chip-k{font-size:.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.chip-v{font-size:.85rem;font-weight:700;color:#fff;margin-top:.15rem;font-variant-numeric:tabular-nums}
.action-wrap{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.abtn{font-size:.82rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  border:none;border-radius:var(--radius-sm);padding:.72rem;cursor:pointer;transition:transform .1s,box-shadow .2s}
.abtn-buy{background:linear-gradient(135deg,#00c853,#00e676);color:#000}
.abtn-sell{background:linear-gradient(135deg,#c62828,#ff2d55);color:#fff}
.abtn:hover{transform:translateY(-2px)}
.abtn-buy:hover{box-shadow:0 6px 20px #00e67644}
.abtn-sell:hover{box-shadow:0 6px 20px #ff2d5544}
.abtn:active{transform:translateY(0)}

/* Shared action buttons (phase 4) */
.btn-ui{
  border:none;
  border-radius:8px;
  padding:10px 14px;
  cursor:pointer;
  font-size:12px;
  font-weight:700;
  transition:all .2s;
}
.btn-ui:hover{transform:translateY(-1px)}
.btn-ui:active{transform:translateY(0)}
.btn-ui-primary{
  background:linear-gradient(135deg,#7ecbff,#5aa9e8);
  color:#031524;
  box-shadow:0 6px 18px rgba(110,194,255,0.2);
}
.btn-ui-success{
  background:linear-gradient(135deg,#31bf90,#2fd6a1);
  color:#032018;
  box-shadow:0 6px 18px rgba(49,191,144,0.22);
}
.btn-ui-danger{
  background:linear-gradient(135deg,#d4677d,#f37d8f);
  color:#fff;
  box-shadow:0 6px 18px rgba(243,125,143,0.2);
}
.btn-ui-ghost{
  background:rgba(8,18,31,0.5);
  color:var(--txt);
  border:1px solid var(--bdr2);
}
.btn-ui-outline-danger{
  background:rgba(243,125,143,0.1);
  color:var(--red);
  border:1px solid var(--red);
}
.btn-block{width:100%}
.log-wrap{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.3rem}
.le{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;border-radius:7px;
  border:1px solid var(--bdr);background:var(--card2);font-size:.72rem}
.le-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.le.BUY .le-dot{background:var(--green);box-shadow:0 0 5px var(--green)}
.le.SELL .le-dot{background:var(--red);box-shadow:0 0 5px var(--red)}
.le.HOLD .le-dot{background:var(--yellow)}
.le-sig{font-weight:800;min-width:30px}
.le.BUY .le-sig{color:var(--green)}
.le.SELL .le-sig{color:var(--red)}
.le.HOLD .le-sig{color:var(--yellow)}
.le-conf{color:var(--muted);font-size:.65rem}
.le-price{flex:1;text-align:right;color:#fff;font-variant-numeric:tabular-nums}
.le-time{color:var(--muted);font-size:.62rem;min-width:38px;text-align:right}

/* BOTTOM */
#bottom{display:grid;grid-template-columns:1fr 1fr 1fr;background:var(--surf);border-top:1px solid var(--bdr)}
.bot-col{padding:.75rem 1rem;border-right:1px solid var(--bdr)}
.bot-col:last-child{border-right:none}
.bot-title{font-size:.58rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
.bot-row{display:flex;align-items:center;justify-content:space-between;
  padding:.25rem 0;border-bottom:1px solid var(--bdr);font-size:.7rem}
.bot-row:last-child{border-bottom:none}
.bot-row .sym{color:var(--muted);font-size:.65rem}
.bot-row .val{font-variant-numeric:tabular-nums;font-weight:600}

/* Dashboard-first calm reveal */
@keyframes dashboardFadeUp{
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:translateY(0)}
}
#tab-dashboard.active #grid .col,
#tab-dashboard.active #bottom{
  animation:dashboardFadeUp .42s ease both;
}
#tab-dashboard.active #grid .col:nth-child(1){animation-delay:.04s}
#tab-dashboard.active #grid .col:nth-child(3){animation-delay:.09s}
#tab-dashboard.active #bottom{animation-delay:.12s}

/* Cinematic reveal utility for in-view sections */
.reveal-up{
  opacity:0;
  transform:translateY(16px) scale(.995);
  transition:opacity .52s ease, transform .52s ease;
  will-change:transform,opacity;
}
.reveal-up.in{
  opacity:1;
  transform:translateY(0) scale(1);
}

/* LOADER */
#loader{position:fixed;inset:0;background:var(--bg);z-index:999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;transition:opacity .5s}
#loader.hide{opacity:0;pointer-events:none}
.loader-hex{width:50px;height:50px;
  clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
  background:linear-gradient(135deg,var(--gold),var(--gold2));animation:spin 1.5s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-text{font-size:.7rem;letter-spacing:.3em;color:var(--muted);text-transform:uppercase}

/* ── TAB BAR ── */
#tabbar{
  display:flex;align-items:center;gap:0;
  background:var(--surf);border-bottom:1px solid var(--bdr);
  padding:0 1rem;overflow-x:auto;scrollbar-width:none;flex-shrink:0;min-height:46px;
}
#tabbar::-webkit-scrollbar{display:none}
.tab-btn{
  display:flex;align-items:center;gap:.4rem;
  padding:.72rem 1rem;font-size:.7rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;cursor:pointer;
  background:transparent;border:none;color:var(--muted);
  border-bottom:2px solid transparent;white-space:nowrap;
  transition:color .2s,border-color .2s,background .2s; margin-bottom:-1px;
  border-radius:8px 8px 0 0;
}
.tab-btn:hover{color:var(--txt);background:rgba(127,212,255,0.08)}
.tab-btn.active{color:var(--gold);border-bottom-color:var(--gold);text-shadow:0 0 8px rgba(110,194,255,0.4)}

.pc-range-btn{
  background:var(--surf);
  border:1px solid var(--bdr2);
  color:var(--txt);
  padding:0.24rem 0.56rem;
  border-radius:8px;
  font-size:0.68rem;
  font-weight:700;
  cursor:pointer;
  transition:all .2s;
}
.pc-range-btn:hover{
  border-color:var(--gold);
  color:var(--gold);
  box-shadow:0 4px 12px rgba(110,194,255,0.14);
}

/* ── TAB PANELS ── */
.tab-panel{display:none;flex:1;overflow:hidden;flex-direction:column}
.tab-panel.active{display:flex}

/* ── PORTFOLIO TAB ── */
.pf-tab-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem}
.pf-hero-row{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem}
.pf-hero-card{
  background:var(--card);border:1px solid var(--bdr);border-radius:12px;
  padding:1rem 1.2rem;
}
.pf-hero-card.gold{border-color:#3a2e0a;background:linear-gradient(135deg,#1a140a,#211a08)}
.pf-hc-label{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
.pf-hc-val{font-size:1.8rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;margin:.2rem 0}
.pf-hc-val.gold{color:var(--gold2)}
.pf-hc-sub{font-size:.7rem;color:var(--muted)}
.pf-table-wrap{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
.pf-table-head{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;
  padding:.5rem 1rem;background:var(--card2);border-bottom:1px solid var(--bdr)}
.pf-th{font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.pf-table-body{max-height:260px;overflow-y:auto}
.pf-row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;
  padding:.55rem 1rem;border-bottom:1px solid var(--bdr);font-size:.75rem;align-items:center}
.pf-row:last-child{border-bottom:none}
.pf-row:hover{background:var(--card2)}
.pf-coin{display:flex;align-items:center;gap:.4rem;font-weight:700}
.pf-dot{width:8px;height:8px;border-radius:50%}
.pf-empty{padding:2rem;text-align:center;color:var(--muted);font-size:.75rem}
.pf-chart-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.pf-mini-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1rem}
.pf-mini-title{font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.75rem}
.pf-bar-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;font-size:.72rem}
.pf-bar-track{height:6px;background:var(--bdr);border-radius:3px;overflow:hidden;margin-bottom:.6rem}
.pf-bar-fill{height:100%;border-radius:3px}

/* ── AI MODEL TAB ── */
.ai-tab-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem}
.ai-top-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.ai-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
.ai-card-head{padding:.7rem 1rem;background:var(--card2);border-bottom:1px solid var(--bdr);
  font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
  display:flex;align-items:center;gap:.4rem}
.ai-card-head::before{content:'';width:3px;height:10px;border-radius:2px;background:var(--gold);box-shadow:0 0 6px var(--gold)}
.ai-card-body{padding:1rem}
.model-option{
  display:flex;align-items:center;gap:.75rem;padding:.6rem .8rem;border-radius:8px;
  border:1px solid var(--bdr);margin-bottom:.4rem;cursor:pointer;transition:border-color .2s,background .2s;
}
.model-option:hover{border-color:var(--bdr2);background:var(--card2)}
.model-option.selected{border-color:var(--gold);background:rgba(204,0,0,.07)}
.model-radio{width:14px;height:14px;border-radius:50%;border:2px solid var(--bdr2);
  flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:border-color .2s}
.model-option.selected .model-radio{border-color:var(--gold)}
.model-radio-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:none}
.model-option.selected .model-radio-dot{display:block}
.model-info{flex:1}
.model-name{font-size:.8rem;font-weight:700;color:#fff}
.model-desc{font-size:.65rem;color:var(--muted);margin-top:.1rem}
.model-badge{font-size:.6rem;font-weight:700;padding:.15rem .5rem;border-radius:4px;flex-shrink:0}
.badge-green{background:#00e67622;color:var(--green);border:1px solid var(--green)}
.badge-gold{background:rgba(204,0,0,.15);color:var(--gold);border:1px solid var(--gold)}
.badge-blue{background:#448aff22;color:var(--cyan);border:1px solid var(--cyan)}
.badge-red{background:#ff2d5522;color:var(--red);border:1px solid var(--red)}
.ai-param-row{display:flex;align-items:center;justify-content:space-between;
  padding:.6rem 0;border-bottom:1px solid var(--bdr);gap:1rem}
.ai-param-row:last-child{border-bottom:none}
.ai-param-info .ai-param-name{font-size:.8rem;font-weight:600;color:#fff}
.ai-param-info .ai-param-desc{font-size:.65rem;color:var(--muted);margin-top:.1rem}
.ai-indicators-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.ai-ind-toggle{display:flex;align-items:center;justify-content:space-between;
  padding:.45rem .6rem;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;font-size:.75rem}
.ai-ind-name{color:var(--txt);font-weight:600}
.ai-backtest{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
.ai-bt-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.ai-bt-cell{padding:.75rem;border-right:1px solid var(--bdr);text-align:center}
.ai-bt-cell:last-child{border-right:none}
.ai-bt-label{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.ai-bt-val{font-size:1rem;font-weight:800;margin-top:.2rem;font-variant-numeric:tabular-nums}
.apply-btn{
  display:block;width:100%;padding:.7rem;margin-top:.75rem;
  background:linear-gradient(135deg,var(--gold),var(--gold2));color:#000;
  border:none;border-radius:10px;font-size:.85rem;font-weight:800;
  letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:opacity .2s;
}
.apply-btn:hover{opacity:.85}

/* ── ALERTS TAB ── */
.alerts-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem}
.alert-form{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1.2rem}
.alert-form-title{font-size:.65rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--muted);margin-bottom:.9rem;display:flex;align-items:center;gap:.4rem}
.alert-form-title::before{content:'';width:3px;height:10px;border-radius:2px;background:var(--gold);box-shadow:0 0 6px var(--gold)}
.alert-grid{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:.5rem;align-items:end}
.form-group{display:flex;flex-direction:column;gap:.3rem}
.form-label{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.form-input,.form-select{
  background:var(--card2);border:1px solid var(--bdr);border-radius:7px;
  padding:.5rem .7rem;color:var(--txt);font-size:.8rem;outline:none;
  transition:border-color .2s;
}
.form-input:focus,.form-select:focus{border-color:var(--gold)}
.form-select option{background:var(--card2)}
.btn-add-alert{
  background:linear-gradient(135deg,var(--gold),var(--gold2));color:#000;
  border:none;border-radius:7px;padding:.5rem 1rem;font-size:.75rem;
  font-weight:800;letter-spacing:.08em;cursor:pointer;white-space:nowrap;
  transition:opacity .2s;
}
.btn-add-alert:hover{opacity:.85}
.alert-list{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
.alert-list-head{padding:.6rem 1rem;background:var(--card2);border-bottom:1px solid var(--bdr);
  font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.alert-item{display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;border-bottom:1px solid var(--bdr);font-size:.75rem}
.alert-item:last-child{border-bottom:none}
.alert-sym{font-weight:800;min-width:40px}
.alert-cond{
  font-size:.65rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;
}
.alert-cond.above{background:#00e67622;color:var(--green);border:1px solid var(--green)}
.alert-cond.below{background:#ff2d5522;color:var(--red);border:1px solid var(--red)}
.alert-price{flex:1;font-variant-numeric:tabular-nums}
.alert-status{font-size:.65rem;font-weight:700;margin-left:auto}
.alert-status.active{color:var(--green)}
.alert-status.triggered{color:var(--yellow)}
.alert-del{
  width:22px;height:22px;border-radius:5px;border:1px solid var(--bdr);
  background:transparent;color:var(--muted);cursor:pointer;font-size:.7rem;
  display:flex;align-items:center;justify-content:center;transition:all .2s;
}
.alert-del:hover{border-color:var(--red);color:var(--red)}
.no-alerts{padding:2rem;text-align:center;color:var(--muted);font-size:.75rem}

/* ── CLAUDE AI TAB ── */
.claude-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem}
.claude-hero{
  background:linear-gradient(135deg,#1a0a2e,#0d0620);
  border:1px solid #7a0000;border-radius:14px;padding:1.5rem;
  position:relative;overflow:hidden;
}
.claude-hero::before{
  content:'';position:absolute;inset:0;
  background:radial-gradient(circle at 80% 20%,rgba(168,85,247,.15),transparent 60%);
  pointer-events:none;
}
.claude-hero-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.claude-badge{
  display:flex;align-items:center;gap:.4rem;
  font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:#ff8888;
}
.claude-badge-dot{width:7px;height:7px;border-radius:50%;background:#a855f7;box-shadow:0 0 8px #a855f7;animation:blink 2s infinite}
.claude-rec{
  display:inline-flex;align-items:center;gap:.4rem;
  font-size:1.8rem;font-weight:900;letter-spacing:.04em;
}
.claude-rec.BUY{color:var(--green);text-shadow:0 0 20px var(--green)}
.claude-rec.SELL{color:var(--red);text-shadow:0 0 20px var(--red)}
.claude-rec.HOLD{color:var(--yellow);text-shadow:0 0 15px var(--yellow)}
.claude-headline{font-size:.85rem;color:rgba(255,255,255,.7);margin:.3rem 0 .75rem;font-style:italic}
.claude-conf-row{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem}
.claude-conf-label{font-size:.65rem;color:#9ca3af;min-width:70px}
.claude-conf-track{flex:1;height:6px;background:#2d1b69;border-radius:3px;overflow:hidden}
.claude-conf-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#7c3aed,#a855f7);transition:width .6s ease}
.claude-conf-pct{font-size:.75rem;font-weight:700;color:#ff8888;min-width:36px;text-align:right}
.claude-meta{display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap}
.claude-chip{
  font-size:.65rem;font-weight:700;padding:.2rem .55rem;border-radius:5px;
}
.claude-chip.risk-LOW{background:#00e67620;color:var(--green);border:1px solid var(--green)}
.claude-chip.risk-MEDIUM{background:#ffd60020;color:var(--yellow);border:1px solid var(--yellow)}
.claude-chip.risk-HIGH{background:#ff2d5520;color:var(--red);border:1px solid var(--red)}
.claude-chip.risk-EXTREME{background:#ff000030;color:#ff4444;border:1px solid #ff4444}
.claude-chip.purple{background:#cc000020;color:#ff8888;border:1px solid #7a0000}

.claude-body{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.claude-analysis-card{
  background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1rem;
  grid-column:1/-1;
}
.claude-factors{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1rem}
.claude-targets{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1rem}
.claude-section-title{
  font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin-bottom:.65rem;display:flex;align-items:center;gap:.4rem;
}
.claude-section-title::before{content:'';width:3px;height:10px;border-radius:2px;background:#a855f7;box-shadow:0 0 6px #a855f7}
.claude-analysis-text{font-size:.78rem;line-height:1.65;color:var(--txt)}
.factor-list{display:flex;flex-direction:column;gap:.3rem}
.factor-item{
  display:flex;align-items:flex-start;gap:.5rem;
  font-size:.72rem;color:var(--txt);
}
.factor-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:.3rem}
.factor-dot.bull{background:var(--green)}
.factor-dot.bear{background:var(--red)}
.target-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.target-row{background:var(--card2);border-radius:7px;padding:.45rem .65rem}
.target-label{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.target-val{font-size:.85rem;font-weight:700;color:#fff;margin-top:.1rem;font-variant-numeric:tabular-nums}
.target-val.pos{color:var(--green)}.target-val.neg{color:var(--red)}.target-val.purple{color:#ff8888}

.claude-actions{display:flex;align-items:center;gap:.75rem}
.btn-analyze{
  display:flex;align-items:center;gap:.4rem;
  background:linear-gradient(135deg,#cc0000,#ff2020);color:#fff;
  border:none;border-radius:10px;padding:.6rem 1.2rem;
  font-size:.8rem;font-weight:700;letter-spacing:.06em;cursor:pointer;
  transition:opacity .2s,transform .1s;
}
.btn-analyze:hover{opacity:.9;transform:translateY(-1px)}
.btn-analyze:active{transform:translateY(0)}
.btn-analyze:disabled{opacity:.5;cursor:not-allowed;transform:none}
.claude-last{font-size:.65rem;color:var(--muted)}
.claude-spinner{
  width:14px;height:14px;border-radius:50%;
  border:2px solid rgba(255,255,255,.3);border-top-color:#fff;
  animation:spin 0.8s linear infinite;display:none;
}
.btn-analyze.loading .claude-spinner{display:block}
.btn-analyze.loading .btn-analyze-icon{display:none}
.claude-empty{
  text-align:center;padding:3rem 1rem;
  display:flex;flex-direction:column;align-items:center;gap:.75rem;
}
.claude-empty-icon{font-size:2.5rem;opacity:.4}
.claude-empty-title{font-size:.9rem;font-weight:700;color:var(--txt)}
.claude-empty-desc{font-size:.75rem;color:var(--muted);max-width:300px;line-height:1.5}
.claude-error{
  background:#380015;border:1px solid var(--red);border-radius:10px;
  padding:.75rem 1rem;font-size:.75rem;color:var(--red);
}

/* ── SETTINGS TAB ── */
.settings-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem;max-width:700px}
.settings-section{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
.settings-head{padding:.7rem 1rem;background:var(--card2);border-bottom:1px solid var(--bdr);
  font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
  display:flex;align-items:center;gap:.4rem}
.settings-head::before{content:'';width:3px;height:10px;border-radius:2px;background:var(--gold);box-shadow:0 0 6px var(--gold)}
.settings-row{display:flex;align-items:center;justify-content:space-between;
  padding:.75rem 1rem;border-bottom:1px solid var(--bdr);gap:1rem}
.settings-row:last-child{border-bottom:none}
.settings-info{display:flex;flex-direction:column;gap:.15rem}
.settings-name{font-size:.8rem;font-weight:600;color:#fff}
.settings-desc{font-size:.65rem;color:var(--muted)}
/* toggle switch */
.toggle{position:relative;display:inline-block;width:38px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.toggle-slider{position:absolute;inset:0;background:var(--bdr2);border-radius:20px;cursor:pointer;transition:.3s}
.toggle-slider::before{content:'';position:absolute;width:14px;height:14px;border-radius:50%;
  background:#fff;left:3px;top:3px;transition:.3s}
.toggle input:checked + .toggle-slider{background:var(--gold)}
.toggle input:checked + .toggle-slider::before{transform:translateX(18px)}
/* range input */
.range-wrap{display:flex;align-items:center;gap:.5rem}
.range-wrap input[type=range]{
  width:120px;accent-color:var(--gold);cursor:pointer;
}
.range-val{font-size:.75rem;font-weight:700;color:var(--gold);min-width:30px;text-align:right}
/* select in settings */
.settings-select{
  background:var(--card2);border:1px solid var(--bdr);border-radius:7px;
  padding:.35rem .6rem;color:var(--txt);font-size:.75rem;outline:none;cursor:pointer;
}
.settings-select:focus{border-color:var(--gold)}

@media(max-width:1000px){#col-left,.col-resizer:first-of-type{display:none}}
@media(max-width:660px){
  #grid{flex-direction:column}
  #col-right{width:100%!important}
  .col-resizer{display:none}
  #bottom{grid-template-columns:1fr}
  .bot-col{border-right:none;border-bottom:1px solid var(--bdr)}
  .pf-hero-row{grid-template-columns:1fr 1fr}
  .alert-grid{grid-template-columns:1fr 1fr}
  .pf-chart-row{grid-template-columns:1fr}
  .agents-wrap{flex:1;overflow-y:auto;padding:1rem 1.5rem;display:flex;flex-direction:column;gap:1rem}
  .agents-header{margin-bottom:.5rem}
  .agents-title{font-size:1.2rem;font-weight:800;color:#fff;letter-spacing:.05em}
  .agents-subtitle{font-size:.72rem;color:var(--muted);margin-top:.2rem}
  .agents-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem}
  .agents-empty{
    grid-column:1/-1;background:var(--card);border:1px solid var(--bdr);border-radius:12px;
    padding:3rem;text-align:center;
    display:flex;flex-direction:column;align-items:center;gap:.75rem;
  }
  .agents-empty-icon{font-size:2.5rem;opacity:.4}
  .agents-empty-title{font-size:.9rem;font-weight:700;color:var(--txt)}
  .agents-empty-desc{font-size:.75rem;color:var(--muted);max-width:320px;line-height:1.5}
  .agent-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .agent-card-head{padding:.6rem 1rem;background:var(--card2);border-bottom:1px solid var(--bdr);font-size:.65rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:.4rem}
  .agent-card-head::before{content:'';width:3px;height:10px;border-radius:2px;background:var(--gold)}
  .agent-card-body{padding:1rem;flex:1;display:flex;flex-direction:column;gap:.5rem}
  .agent-rec{font-size:1.6rem;font-weight:900;letter-spacing:.04em}
  .agent-rec.BUY{color:var(--green)}
  .agent-rec.SELL{color:var(--red)}
  .agent-rec.HOLD{color:var(--yellow)}
  .agent-conf{font-size:.72rem;color:var(--muted)}
  .agent-risk{font-size:.6rem;font-weight:700;padding:.15rem .5rem;border-radius:4px;display:inline-block;width:fit-content}
  .agent-risk.risk-LOW{background:#00e67622;color:var(--green);border:1px solid var(--green)}
  .agent-risk.risk-MEDIUM{background:#ffd60022;color:var(--yellow);border:1px solid var(--yellow)}
  .agent-risk.risk-HIGH{background:#ff2d5522;color:var(--red);border:1px solid var(--red)}
  .agent-risk.risk-EXTREME{background:#ff000030;color:#ff4444;border:1px solid #ff4444}
  .agent-detail{font-size:.7rem;color:var(--muted);line-height:1.5}
  .agents-aggregated{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.75rem}
  .agg-title{font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .agg-rec{font-size:2rem;font-weight:900}
  .agg-rec.BUY{color:var(--green)}
  .agg-rec.SELL{color:var(--red)}
  .agg-rec.HOLD{color:var(--yellow)}
  .agg-meta{display:flex;gap:.5rem;flex-wrap:wrap}
  .agg-chip{font-size:.65rem;font-weight:700;padding:.2rem .55rem;border-radius:5px}
  .agg-chip.purple{background:#cc000020;color:#ff8888;border:1px solid #7a0000}
  @media(max-width:1100px){.agents-grid{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:700px){.agents-grid{grid-template-columns:1fr 1fr}}

  /* ── LOGIN PAGE ─────────────────────────────────────────────────────────── */
  #loginPage{position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;align-items:center;justify-content:center}
  #loginPage.hidden{display:none!important;visibility:hidden!important}
  .login-container{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:40px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4)}
  .login-header{text-align:center;margin-bottom:30px}
  .login-icon{font-size:3rem;margin-bottom:15px}
  .login-title{color:var(--gold);font-size:1.5rem;font-weight:800;margin-bottom:8px}
  .login-subtitle{color:var(--muted);font-size:0.85rem}
  .login-form{display:flex;flex-direction:column;gap:15px}
  .login-field{display:flex;flex-direction:column;gap:6px}
  .login-label{color:var(--txt);font-weight:600;font-size:0.9rem}
  .login-input{background:var(--surf);border:1px solid var(--bdr);color:var(--txt);padding:10px 12px;border-radius:6px;font-size:0.95rem;transition:border-color 0.2s}
  .login-input:focus{outline:none;border-color:var(--gold)}
  .login-button{background:var(--gold);color:#000;border:none;padding:12px;border-radius:6px;font-weight:700;font-size:0.95rem;cursor:pointer;transition:background 0.2s}
  .login-button:hover{background:var(--gold2)}
  .login-button:disabled{background:var(--muted);cursor:not-allowed}
  .login-error{color:var(--red);font-size:0.85rem;text-align:center;margin-top:10px;min-height:20px}
  .login-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.2);border-top-color:#000;border-radius:50%;animation:spin 0.6s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>

<div class="gradient-blur"><div></div><div></div><div></div><div></div><div></div><div></div></div>

<div id="loader"><div class="loader-hex"></div><div class="loader-text">Loading pukitradev2</div></div>

<!-- ══ LOGIN PAGE ══ -->
<div id="loginPage">
  <div class="login-container">
    <div class="login-header">
      <div class="login-icon">🔐</div>
      <div class="login-title">PUKITRADEV2</div>
      <div class="login-subtitle">AI Trading System</div>
    </div>
    <form class="login-form" onsubmit="handleLogin(event)">
      <div class="login-field">
        <label class="login-label">Username</label>
        <input type="text" class="login-input" id="loginUsername" placeholder="Enter username" required>
      </div>
      <div class="login-field">
        <label class="login-label">Password</label>
        <input type="password" class="login-input" id="loginPassword" placeholder="Enter password" required>
      </div>
      <button type="submit" class="login-button" id="loginBtn">
        <span id="loginBtnText">Login</span>
      </button>
      <div class="login-error" id="loginError"></div>
    </form>
  </div>
</div>

<div id="app">
<div id="topbar" class="border-gradient">
  <div class="logo-wrap">
    <div class="logo-hex">N</div>
    <div class="logo-text">PUKITRA<span>DEV2</span></div>
  </div>
  <div class="tb-center">
    <div class="tb-pair active" data-sym="BTC">
      <span class="tb-sym">BTC/USDT</span>
      <div style="display:flex;align-items:center;gap:0.3rem">
        <span style="font-size:0.7rem;color:var(--muted)">Bitcoin</span>
        <span class="tb-val" id="tbv-BTC">$43,250</span>
      </div>
      <span class="tb-chg pos" id="tbc-BTC">+0.00%</span>
    </div>
    <div class="tb-pair" data-sym="ETH">
      <span class="tb-sym">ETH/USDT</span>
      <div style="display:flex;align-items:center;gap:0.3rem">
        <span style="font-size:0.7rem;color:var(--muted)">Ethereum</span>
        <span class="tb-val" id="tbv-ETH">$2,280</span>
      </div>
      <span class="tb-chg pos" id="tbc-ETH">+0.00%</span>
    </div>
    <div class="tb-pair" data-sym="SOL">
      <span class="tb-sym">SOL/USDT</span>
      <div style="display:flex;align-items:center;gap:0.3rem">
        <span style="font-size:0.7rem;color:var(--muted)">Solana</span>
        <span class="tb-val" id="tbv-SOL">$98.40</span>
      </div>
      <span class="tb-chg neg" id="tbc-SOL">-0.00%</span>
    </div>
    <div class="tb-pair" data-sym="BNB">
      <span class="tb-sym">BNB/USDT</span>
      <div style="display:flex;align-items:center;gap:0.3rem">
        <span style="font-size:0.7rem;color:var(--muted)">Binance</span>
        <span class="tb-val" id="tbv-BNB">$385</span>
      </div>
      <span class="tb-chg pos" id="tbc-BNB">+0.00%</span>
    </div>
  </div>
  <div class="tb-right">
    <div class="status-dot"></div>
    <span id="clock">--:--:--</span>
    <a class="icon-btn" href="/analysis" title="Analysis">A</a>
    <button class="icon-btn" onclick="refresh()">&#8635;</button>
  </div>
</div>

<div id="tabbar">
  <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
  <button class="tab-btn" data-tab="portfolio">Portfolio</button>
  <button class="tab-btn" data-tab="evolution">Evolution</button>
  <button class="tab-btn" data-tab="logs">Logs</button>
  <button class="tab-btn" data-tab="agents">Agents</button>
  <button class="tab-btn" data-tab="settings">Settings</button>
</div>

<!-- ══ DASHBOARD TAB ══ -->
<div class="tab-panel active" id="tab-dashboard">

<div id="grid">
  <!-- LEFT -->
  <div class="col" id="col-left" style="width:260px;flex-shrink:0">
    <div class="panel" id="panel-portfolio" style="overflow-y:auto">
      <div class="ph"><div class="ph-title">Portfolio</div><div class="ph-badge" id="countdown">15s</div></div>
      <div class="acct-hero">
        <div class="acct-label">Total Balance</div>
        <div class="acct-val" id="pf-bal">$10,000.00</div>
        <div class="acct-sub">P&amp;L today: <span id="pf-pnl" class="g">+$0.00</span></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-l">Confidence</div><div class="kpi-v cyan" id="pf-conf">--%</div></div>
        <div class="kpi"><div class="kpi-l">Signal Strength</div><div class="kpi-v gold" id="pf-strength">--</div></div>
        <div class="kpi"><div class="kpi-l">Status</div><div class="kpi-v" id="pf-status">--</div></div>
        <div class="kpi"><div class="kpi-l">Win Rate</div><div class="kpi-v gold" id="pf-wr">--%</div></div>
      </div>
      <div class="flow-wrap">
        <div class="flow-label">
          <span class="pos">Buy</span>
          <span id="flow-pct" class="pos">50%</span>
          <span class="neg">Sell</span>
        </div>
        <div class="flow-track">
          <div class="flow-buy" id="flow-buy" style="width:50%"></div>
          <div class="flow-sell" id="flow-sell" style="width:50%"></div>
        </div>
      </div>
    </div>
    <div class="row-resizer"></div>
    <div class="panel" id="panel-target">
      <div class="ph">
        <div class="ph-title">Trading Target</div>
        <button class="icon-btn" onclick="openSymbolPicker()" title="Change target">&#43;</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--red);box-shadow:0 0 6px var(--red)"></div>
        <span id="currentSymbolLabel" style="font-size:1.1rem;font-weight:800;color:#fff">BTC/USDT</span>
        <span id="currentSymbolName" style="font-size:0.7rem;color:var(--muted)">Bitcoin</span>
      </div>
    </div>
  </div>

  <!-- Symbol picker overlay -->
  <div id="symbolPicker" style="display:none;position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.7);align-items:center;justify-content:center">
    <div style="background:var(--card);border:1px solid var(--bdr2);border-radius:12px;width:320px;max-height:480px;display:flex;flex-direction:column;box-shadow:0 0 30px rgba(204,0,0,0.3)">
      <div style="padding:1rem;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;color:var(--gold);font-size:0.9rem">Select Trading Pair</span>
        <button onclick="closeSymbolPicker()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.2rem">&times;</button>
      </div>
      <div style="padding:0.75rem">
        <input id="symbolSearch" type="text" placeholder="Search crypto..." oninput="filterSymbols()" style="width:100%;background:var(--surf);border:1px solid var(--bdr2);color:var(--txt);padding:0.5rem 0.75rem;border-radius:8px;font-size:0.85rem;outline:none">
      </div>
      <div id="symbolList" style="overflow-y:auto;max-height:320px;padding:0 0.75rem 0.75rem"></div>
    </div>
  </div>

  <div class="col-resizer" id="cr-left"></div>

  <!-- CENTER -->
  <div class="col" id="col-center" style="flex:1;min-width:200px">
    <div class="chart-header">
      <div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span style="font-size:0.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Bitcoin</span>
          <div id="ch-price" class="ch-price">$43,250</div>
        </div>
        <div id="ch-change" class="ch-change pos">+$0.00 (+0.00%)</div>
      </div>
      <div class="ch-label"><strong id="ch-label-sym">BTC / USDT</strong>AI Trading System · Live</div>
    </div>
    <!-- AI Analyzed Chart (replaces mini price chart) -->
    <div id="aiChartPanel" style="flex:1;display:flex;flex-direction:column;padding:1rem;background:rgba(0,0,0,0.2);border-radius:8px;margin:0.75rem">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem">
        <div style="display:flex;flex-direction:column;gap:2px">
          <div style="color:var(--txt-dim);font-size:0.85rem" id="aiChartTitle">AI chart · Binance candles</div>
          <div style="color:var(--muted);font-size:0.72rem" id="aiChartSub">--</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          <select id="aiSym" class="pill" style="padding:6px 10px;border-radius:999px;font-size:12px">
            <option value="BTCUSDT">BTC/USDT</option>
            <option value="ETHUSDT">ETH/USDT</option>
            <option value="SOLUSDT">SOL/USDT</option>
            <option value="BNBUSDT">BNB/USDT</option>
          </select>
          <select id="aiTf" class="pill" style="padding:6px 10px;border-radius:999px;font-size:12px">
            <option value="1d">1d</option>
            <option value="1w">1w</option>
          </select>
          <select id="aiRange" class="pill" style="padding:6px 10px;border-radius:999px;font-size:12px">
            <option value="1w">1W</option>
            <option value="1m" selected>1M</option>
            <option value="3m">3M</option>
            <option value="1y">1Y</option>
            <option value="3y">3Y</option>
            <option value="all">ALL</option>
          </select>
          <button type="button" class="pc-range-btn" id="aiLoadBtn" style="padding:6px 10px">Load</button>
          <button type="button" class="btn-ui btn-ui-primary" id="aiAnalyzeBtn" style="padding:6px 12px">Analyze</button>
          <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;padding:6px 8px;border:1px solid rgba(255,255,255,0.08);border-radius:999px;background:rgba(0,0,0,0.18)">
            <input type="checkbox" id="aiLog" style="transform:translateY(1px)"> Log
          </label>
        </div>
      </div>
      <div style="flex:1;position:relative;min-height:180px">
        <div id="aiChart" class="chart-fade" style="position:absolute;inset:0"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
        <div style="display:flex;gap:12px;align-items:center;color:var(--muted);font-size:12px">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="aiTgPrice" checked> Price</label>
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="aiTgMA" checked> MA200</label>
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="aiTgAI"> AI</label>
        </div>
        <div id="aiChartStatus" style="color:var(--muted);font-size:11px">Ready</div>
      </div>
    </div>
  </div>

  <div class="col-resizer" id="cr-right"></div>

  <!-- RIGHT -->
  <div class="col" id="col-right" style="width:300px;flex-shrink:0">
    <div class="panel">
      <div class="ph"><div class="ph-title">AI Signal</div><div class="ph-badge" id="ai-ts">--:--</div></div>
      <div class="sig-hero HOLD" id="sigHero">
        <div class="ring-wrap"><div class="ring"></div><div class="ring"></div><div class="ring"></div></div>
        <div class="sig-label">Recommendation</div>
        <div class="sig-word" id="sigWord">ANALYZING</div>
        <div class="sig-price" id="sigPrice">@ $--</div>
      </div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 120 70">
          <path fill="none" stroke="var(--bdr2)" stroke-width="8" stroke-linecap="round"
            d="M 16 60 A 44 44 0 0 1 104 60" stroke-dasharray="138 138" stroke-dashoffset="0"/>
          <path id="gaugeFill" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round"
            d="M 16 60 A 44 44 0 0 1 104 60" stroke-dasharray="138 138" stroke-dashoffset="138"
            style="transition:stroke-dashoffset .7s ease,stroke .4s"/>
          <text id="gaugeNum" x="60" y="56" fill="var(--gold)"
            style="font-size:1.3rem;font-weight:800;font-family:system-ui;text-anchor:middle">--%</text>
          <text x="60" y="68" fill="var(--muted)"
            style="font-size:.55rem;font-family:system-ui;text-anchor:middle;letter-spacing:.1em;text-transform:uppercase">Confidence</text>
        </svg>
      </div>
      <div class="chips">
        <div class="chip"><div class="chip-k">RSI</div><div class="chip-v" id="c-rsi">--</div></div>
        <div class="chip"><div class="chip-k">MACD</div><div class="chip-v" id="c-macd">--</div></div>
        <div class="chip"><div class="chip-k">BB%</div><div class="chip-v" id="c-bb">--</div></div>
        <div class="chip"><div class="chip-k">EMA20</div><div class="chip-v" id="c-ema">--</div></div>
        <div class="chip"><div class="chip-k">Vol</div><div class="chip-v" id="c-vol">--</div></div>
        <div class="chip"><div class="chip-k">Trend</div><div class="chip-v" id="c-trend">--</div></div>
      </div>
      <button id="btnAnalyze" class="btn-ui btn-ui-primary btn-block" onclick="runClaudeAnalysis()" style="margin-top:12px;font-size:13px;font-weight:800;letter-spacing:.06em">▶ RUN ANALYSIS</button>
    </div>

    <div class="row-resizer"></div>

    <!-- Trade History Panel -->
    <div class="panel" id="panel-log" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:60px">
      <div class="ph"><div class="ph-title">Trade History</div></div>
      <div class="log-wrap" id="logWrap">
        <div style="color:var(--muted);font-size:.7rem;text-align:center;padding:.5rem">Awaiting trades...</div>
      </div>
    </div>
  </div>
</div>

</div><!-- /tab-dashboard -->

<!-- ══ PORTFOLIO TAB ══ -->
<div class="tab-panel" id="tab-portfolio">
  <div class="pf-tab-wrap" style="padding:1rem;overflow-y:auto;height:100%">
    <!-- KPIs Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #0f3460;border-radius:10px;padding:1rem">
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem">Total Balance</div>
        <div style="font-size:1.3rem;font-weight:800;color:#00d4ff;margin-bottom:.25rem" id="pt-balance">$10,000.00</div>
        <div style="font-size:.65rem;color:var(--muted)">Available capital</div>
      </div>
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #0f3460;border-radius:10px;padding:1rem">
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem">Total P&L</div>
        <div style="font-size:1.3rem;font-weight:800;color:#00e676;margin-bottom:.25rem" id="pt-pnl">+$0.00</div>
        <div style="font-size:.65rem;color:var(--muted)">Realized gains/losses</div>
      </div>
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #0f3460;border-radius:10px;padding:1rem">
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem">Open Positions</div>
        <div style="font-size:1.3rem;font-weight:800;color:#ffd600;margin-bottom:.25rem" id="pt-open">0</div>
        <div style="font-size:.65rem;color:var(--muted)">Active trades</div>
      </div>
    </div>

    <!-- Holdings Section -->
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:1rem;margin-bottom:1.5rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem">Holdings</div>
      <div id="pt-holdings" style="display:flex;flex-direction:column;gap:.75rem">
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:1rem;align-items:center;padding:.75rem;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:.75rem;color:var(--muted)">No positions</div>
        </div>
      </div>
    </div>

    <!-- Portfolio Allocation -->
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:1rem;margin-bottom:1.5rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem">Allocation</div>
      <div id="pt-allocation" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem">
        <div style="text-align:center;padding:.5rem;background:rgba(0,212,255,0.1);border-radius:6px;border:1px solid rgba(0,212,255,0.2)">
          <div style="font-size:.65rem;color:var(--muted);margin-bottom:.25rem">Cash</div>
          <div style="font-size:.9rem;font-weight:700;color:#00d4ff" id="pt-cash-pct">100%</div>
        </div>
        <div style="text-align:center;padding:.5rem;background:rgba(0,230,118,0.1);border-radius:6px;border:1px solid rgba(0,230,118,0.2)">
          <div style="font-size:.65rem;color:var(--muted);margin-bottom:.25rem">Positions</div>
          <div style="font-size:.9rem;font-weight:700;color:#00e676" id="pt-pos-pct">0%</div>
        </div>
        <div style="text-align:center;padding:.5rem;background:rgba(255,214,0,0.1);border-radius:6px;border:1px solid rgba(255,214,0,0.2)">
          <div style="font-size:.65rem;color:var(--muted);margin-bottom:.25rem">Risk Exposure</div>
          <div style="font-size:.9rem;font-weight:700;color:#ffd600" id="pt-risk">0%</div>
        </div>
      </div>
    </div>

    <!-- Performance Metrics -->
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:1rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem">Performance</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;font-size:.75rem">
        <div><div style="color:var(--muted);margin-bottom:.25rem">Win Rate</div><div style="font-weight:700;color:#00e676" id="pt-win-rate">0%</div></div>
        <div><div style="color:var(--muted);margin-bottom:.25rem">Max Drawdown</div><div style="font-weight:700;color:#ff6b6b" id="pt-drawdown">0%</div></div>
        <div><div style="color:var(--muted);margin-bottom:.25rem">Sharpe Ratio</div><div style="font-weight:700;color:#00d4ff" id="pt-sharpe">0.00</div></div>
        <div><div style="color:var(--muted);margin-bottom:.25rem">Total Trades</div><div style="font-weight:700;color:#ffd600" id="pt-trades">0</div></div>
      </div>
    </div>
  </div>
</div>

<!-- ══ EVOLUTION TAB ══ -->
<div class="tab-panel" id="tab-evolution">
  <div style="padding:1.5rem;overflow-y:auto;height:100%">
    <!-- Status Card -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #0f3460;border-radius:10px;padding:1.5rem;margin-bottom:1.5rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div>
          <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem">Latest Evolution</div>
          <div style="font-size:1.1rem;font-weight:700;color:#00d4ff" id="evo-timestamp">Never</div>
        </div>
        <div>
          <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem">Total Cycles</div>
          <div style="font-size:1.1rem;font-weight:700;color:#ffd600" id="evo-count">0</div>
        </div>
      </div>
      <div style="font-size:.75rem;color:var(--muted)">Status: <span id="evo-status" style="color:#00e676;font-weight:700">Ready</span></div>
    </div>

    <!-- Control Buttons -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <button class="btn-ui btn-ui-success" onclick="approveEvolution()" style="padding:1rem;font-weight:800;font-size:.9rem;text-transform:uppercase;letter-spacing:.1em">▶ Execute Evolution</button>
      <button class="btn-ui btn-ui-danger" onclick="resetEvolutionParams()" style="padding:1rem;font-weight:800;font-size:.9rem;text-transform:uppercase;letter-spacing:.1em">⟲ Reset Params</button>
    </div>

    <!-- Current Parameters -->
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem">Current Parameters</div>
      <div id="evo-params" style="font-family:monospace;color:#ffd460;line-height:1.8;font-size:.75rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div style="color:var(--muted)">Loading...</div>
      </div>
    </div>

    <!-- Evolution History -->
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:1.5rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem">Evolution History</div>
      <div id="evo-history" style="display:flex;flex-direction:column;gap:.75rem;max-height:300px;overflow-y:auto">
        <div style="font-size:.75rem;color:var(--muted);text-align:center;padding:1rem">No evolution history yet</div>
      </div>
    </div>
  </div>
</div>

<!-- ══ SETTINGS TAB ══ -->
<div class="tab-panel" id="tab-settings">
  <!-- Account & System -->
  <div style="padding: 20px; overflow-y: auto; height: 100%;">
    <div class="settings-section" style="margin-bottom: 20px;">
      <h3 style="color: var(--gold); margin-bottom: 12px; border-bottom: 2px solid var(--gold); padding-bottom: 8px;">👤 Account</h3>
      <div class="settings-card" style="background: rgba(20,20,20,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 13px; color: var(--txt);">Logged in as: <strong style="color: var(--gold);" id="loggedInUser">hongrui</strong></div>
          <div style="font-size: 12px; color: var(--txt-dim); margin-top: 4px;">Sign out of your account</div>
        </div>
        <button class="btn-logout btn-ui btn-ui-danger" onclick="handleLogout()" style="padding:8px 16px;font-weight:600;font-size:13px;">Logout</button>
      </div>
    </div>

    <div class="settings-section" style="margin-bottom: 20px;">
      <h3 style="color: var(--gold); margin-bottom: 12px; border-bottom: 2px solid var(--gold); padding-bottom: 8px;">⚡ Bot Control</h3>
      <div class="settings-card" style="background: rgba(20,20,20,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--txt);">Kill Switch</div>
            <div style="font-size: 12px; color: var(--txt-dim); margin-top: 4px;">Stop or resume automated AI trading</div>
          </div>
          <button id="killSwitchBtn" class="btn-ui btn-ui-danger" onclick="toggleKillSwitch()" style="padding:8px 16px;font-weight:600;font-size:13px;">Loading...</button>
        </div>
        <div id="killSwitchStatus" style="font-size: 11px; color: var(--txt-dim); margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;"></div>
      </div>
    </div>

    <div class="settings-section">
      <h3 style="color: var(--gold); margin-bottom: 12px; border-bottom: 2px solid var(--gold); padding-bottom: 8px;">ℹ️ System</h3>
      <div class="settings-card" style="background: rgba(20,20,20,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--txt);">pukitradev2</div>
            <div style="font-size: 12px; color: var(--txt-dim); margin-top: 4px;">AI Trading Dashboard · Powered by AI Agents</div>
          </div>
          <span style="font-size: 11px; color: var(--txt-dim); background: rgba(204,170,0,0.2); padding: 4px 8px; border-radius: 4px;">v2.0</span>
        </div>
        <div style="font-size: 11px; color: var(--txt-dim); padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">
          <strong>Architecture:</strong> 6 AI Agents + CIO Gatekeeper + Intelligence Analyzer<br>
          <strong>Exchange:</strong> Bitget (Spot Trading)<br>
          <strong>Analysis Cycle:</strong> Every 5 minutes
        </div>
      </div>
    </div>

    <div class="settings-section" style="margin-top: 20px;">
      <h3 style="color: var(--gold); margin-bottom: 12px; border-bottom: 2px solid var(--gold); padding-bottom: 8px;">🔐 API Keys & Advanced</h3>
      <div class="settings-card" style="background: rgba(20,20,20,0.8); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
        <!-- Bitget API -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Bitget API Key</label>
          <input type="password" id="api-bitget-key" placeholder="Enter Bitget API Key" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px; margin-bottom: 6px;">
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Bitget Secret</label>
          <input type="password" id="api-bitget-secret" placeholder="Enter Bitget Secret" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px;">
        </div>

        <!-- DeepSeek/Claude API -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">DeepSeek API Key</label>
          <input type="password" id="api-deepseek-key" placeholder="Enter DeepSeek API Key" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px;">
          <div style="font-size: 11px; color: var(--txt-dim); margin-top: 4px;">Used for AI agent analysis</div>
        </div>

        <!-- Trading Parameters -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Max Trade Size ($)</label>
          <input type="number" id="cfg-max-trade" value="1000" placeholder="1000" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px; margin-bottom: 6px;">

          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Stop Loss %</label>
          <input type="number" id="cfg-stop-loss" value="2" placeholder="2" step="0.1" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px; margin-bottom: 6px;">

          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Take Profit %</label>
          <input type="number" id="cfg-take-profit" value="5" placeholder="5" step="0.1" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px;">
        </div>

        <!-- Confidence Threshold -->
        <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <label style="display: block; font-size: 12px; font-weight: 600; color: var(--txt); margin-bottom: 6px;">Min Confidence Threshold (%)</label>
          <input type="number" id="cfg-confidence" value="70" placeholder="70" min="0" max="100" style="width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px;">
          <div style="font-size: 11px; color: var(--txt-dim); margin-top: 4px;">Only execute trades above this confidence</div>
        </div>

        <!-- Notification Settings -->
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--txt); margin-bottom: 8px;">
            <input type="checkbox" id="cfg-notify-trades" checked style="cursor: pointer; width: 14px; height: 14px;">
            <span>Notify on executed trades</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: var(--txt);">
            <input type="checkbox" id="cfg-notify-errors" checked style="cursor: pointer; width: 14px; height: 14px;">
            <span>Notify on errors</span>
          </label>
        </div>

        <!-- Save Button -->
        <button class="btn-ui btn-ui-success btn-block" onclick="saveAdvancedSettings()">Save Settings</button>
      </div>
    </div>
  </div>
</div>

<!-- ══ AGENTS TAB ══ -->
<div class="tab-panel" id="tab-agents">
  <div class="agents-wrap">
    <div class="agents-header">
      <div class="agents-title">AI Agent Departments</div>
      <div class="agents-subtitle">Parallel analysis from 5 specialized agents</div>
    </div>
    <div class="agents-grid" id="agentsGrid">
      <div class="agents-empty" id="agentsEmpty">
        <div class="agents-empty-icon">&#129302;</div>
        <div class="agents-empty-title">Multi-Agent Analysis</div>
        <div class="agents-empty-desc">Run an analysis from the Claude AI tab to see individual agent breakdowns here.</div>
      </div>
    </div>
    <div class="agents-aggregated" id="agentsAggregated"></div>
  </div>
</div>

<!-- ══ LOGS TAB ══ -->
<div class="tab-panel" id="tab-logs">
  <!-- Enhanced Logs Panel -->
  <div style="display: flex; flex-direction: column; height: 100%; background: rgba(0,0,0,0.2);">
    <div style="padding: 16px; background: rgba(20,20,20,0.9); border-bottom: 2px solid var(--border);">
      <h2 style="color: var(--gold); margin: 0 0 8px 0; font-size: 18px;">📋 System Logs</h2>
      <p style="color: var(--txt-dim); font-size: 12px; margin: 0;">Real-time trading and agent activity logs</p>
    </div>

    <!-- Filters -->
    <div style="padding: 12px 16px; background: rgba(20,20,20,0.8); border-bottom: 1px solid var(--border); display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
      <label style="font-size: 12px; color: var(--txt-dim);">Level:</label>
      <div style="display: flex; gap: 6px;">
        <button class="chip active" data-filter="level" data-value="all" style="padding: 6px 10px; border: 1px solid var(--border); background: var(--gold); color: #000; border-radius: 16px; font-size: 11px; cursor: pointer; font-weight: 600;">All</button>
        <button class="chip" data-filter="level" data-value="SUCCESS" style="padding: 6px 10px; border: 1px solid var(--border); background: rgba(0,200,100,0.2); color: var(--green); border-radius: 16px; font-size: 11px; cursor: pointer;">Success</button>
        <button class="chip" data-filter="level" data-value="ERROR" style="padding: 6px 10px; border: 1px solid var(--border); background: rgba(255,0,0,0.2); color: var(--red); border-radius: 16px; font-size: 11px; cursor: pointer;">Error</button>
      </div>
      <input type="text" id="log-search" placeholder="Search logs..." style="margin-left: auto; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; color: var(--txt); font-size: 12px; min-width: 200px;">
      <button class="btn-ui btn-ui-primary" onclick="applyLogFilters()" style="padding:6px 12px;">Filter</button>
    </div>

    <!-- Log Stream -->
    <div id="log-stream" style="flex: 1; overflow-y: auto; padding: 0; display: flex; flex-direction: column;">
      <div style="padding: 40px 20px; text-align: center; color: var(--txt-dim); display: flex; align-items: center; justify-content: center; flex-direction: column;">
        <div style="font-size: 2rem; margin-bottom: 12px;">📊</div>
        <div style="font-size: 13px;">Loading logs...</div>
        <div style="font-size: 11px; margin-top: 8px; color: var(--txt-dim);">Real-time trading activity appears here</div>
      </div>
    </div>

    <!-- Log Controls -->
    <div style="padding: 12px 16px; background: rgba(20,20,20,0.8); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--txt-dim);">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" id="auto-scroll" checked style="cursor: pointer; width: 14px; height: 14px;">
          Auto-scroll
        </label>
        <span id="log-stats">Loading...</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-ui btn-ui-ghost" onclick="exportLogs('json')" style="padding:6px 12px;">JSON</button>
        <button class="btn-ui btn-ui-ghost" onclick="exportLogs('csv')" style="padding:6px 12px;">CSV</button>
        <button class="btn-ui btn-ui-outline-danger" onclick="clearLogs()" style="padding:6px 12px;">Clear</button>
      </div>
    </div>
  </div>

  <script>
  // Simple log management
  let allLogs = [];
  let logAutoScroll = true;

  function fetchLogs() {
    fetch('/api/intelligence-logs?limit=100')
      .then(function(r){ return r.json(); })
      .then(function(data){
        var rows = (data && Array.isArray(data.logs)) ? data.logs : [];
        allLogs = rows.map(function(log){
          return {
            timestamp: log.timestamp || new Date().toISOString(),
            level: log.level || 'INFO',
            message: log.message || log.headline || (log.symbol ? (log.symbol + ' · ' + (log.recommendation || 'HOLD') + ' @ ' + (log.confidence != null ? log.confidence + '%' : '')) : 'Market intelligence'),
            data: log.data != null ? log.data : { recommendation: log.recommendation, confidence: log.confidence, risk_level: log.risk_level, analysis: log.analysis }
          };
        });
        renderLogs(allLogs);
        var stats = document.getElementById('log-stats');
        if (stats) stats.textContent = allLogs.length + ' entr' + (allLogs.length === 1 ? 'y' : 'ies');
      })
      .catch(function(e){
        console.error('Fetch logs error:', e);
        var stream = document.getElementById('log-stream');
        if (stream) {
          stream.innerHTML = '<div style="padding:24px;text-align:center;color:var(--red);font-size:13px">Could not load logs: ' + (e.message || 'network error') + '</div>';
        }
      });
  }

  function renderLogs(logs) {
    const stream = document.getElementById('log-stream');
    if (logs.length === 0) {
      stream.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--txt-dim);">No logs yet</div>';
      return;
    }
    let html = '';
    logs.forEach(function(log, idx) {
      const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
      const level = log.level || 'INFO';
      const msg = log.message || log.headline || 'System event';
      const color = level === 'ERROR' ? 'var(--red)' : level === 'SUCCESS' ? 'var(--green)' : level === 'WARN' ? 'var(--yellow)' : '#0099ff';
      const id = 'log-' + idx;
      const expanded = document.getElementById(id) && document.getElementById(id).dataset.expanded === 'true';
      const dataStr = log.data ? JSON.stringify(log.data) : '';

      html += '<div style="border-bottom: 1px solid rgba(255,255,255,0.05); border-left: 3px solid ' + color + ';">' +
        '<div style="padding: 10px 16px; font-size: 12px; display: flex; gap: 12px; cursor: pointer; align-items: center; background: ' + (expanded ? 'rgba(255,255,255,0.02)' : 'transparent') + ';" onclick="toggleLog(\'' + id + '\');" data-expanded="' + expanded + '">' +
        '<span style="color: var(--txt-dim); min-width: 70px;">' + time + '</span>' +
        '<span style="color: ' + color + '; font-weight: 600; min-width: 60px;">[' + level + ']</span>' +
        '<span style="color: var(--txt); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + msg + '</span>' +
        '<span style="color: var(--txt-dim); font-size: 11px;">▼</span>' +
        '</div>';

      if(expanded || (document.getElementById(id) === null)) {
        if(dataStr) {
          html += '<div id="' + id + '-content" style="display: ' + (expanded ? 'block' : 'none') + '; padding: 0 16px 12px 16px; font-size: 11px; color: var(--txt-dim); background: rgba(0,0,0,0.3); font-family: monospace; max-height: 200px; overflow-y: auto; word-break: break-all;">' +
            dataStr.substring(0, 500) + (dataStr.length > 500 ? '...' : '') + '</div>';
        }
      }
      html += '</div>';
    });
    stream.innerHTML = html;
    if (logAutoScroll) stream.scrollTop = stream.scrollHeight;
  }

  function toggleLog(id) {
    const header = document.querySelector('[data-expanded][onclick*="' + id + '"]');
    const content = document.getElementById(id + '-content');
    if(!content) return;

    const expanded = header.dataset.expanded === 'true';
    header.dataset.expanded = !expanded;
    content.style.display = expanded ? 'none' : 'block';
    header.style.background = expanded ? 'transparent' : 'rgba(255,255,255,0.02)';
  }

  function applyLogFilters() {
    renderLogs(allLogs);
  }

  function exportLogs(fmt) {
    if (!allLogs.length) { alert('No logs to export'); return; }
    const content = fmt === 'json' ? JSON.stringify(allLogs, null, 2) :
      [['Time','Level','Message'], ...allLogs.map(l => [l.timestamp, l.level, l.message])].map(r => r.map(c => '"' + c + '"').join(',')).join('\n');
    const blob = new Blob([content], { type: fmt === 'json' ? 'application/json' : 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = 'logs_' + dateStr + '.' + fmt;
    a.click();
  }

  function clearLogs() {
    if (confirm('Clear all logs?')) { allLogs = []; renderLogs([]); }
  }

  document.getElementById('auto-scroll')?.addEventListener('change', e => { logAutoScroll = e.target.checked; });
  document.getElementById('log-search')?.addEventListener('input', applyLogFilters);

  window.fetchLogs = fetchLogs;
  fetchLogs();
  setInterval(fetchLogs, 10000);
  </script>
</div>

<script>
// Guaranteed loader hide — runs before anything else can fail
(function(){
  function hide(){ var l=document.getElementById('loader'); if(l){ l.style.opacity='0'; l.style.pointerEvents='none'; } }
  setTimeout(hide, 300);   // fast path
  window.addEventListener('load', function(){ setTimeout(hide, 100); }); // fallback
  window.onerror = function(){ setTimeout(hide, 50); };  // crash fallback
})();

// ── Authentication ──────────────────────────────────────────────────────────
function checkAuth(){
  setTimeout(function(){
    var token = localStorage.getItem('authToken');
    var user = localStorage.getItem('authUser');
    var loginPage = document.getElementById('loginPage');
    var app = document.getElementById('app');

    console.log('🔐 checkAuth called');
    console.log('  Token:', token ? 'EXISTS (' + token.substring(0, 20) + '...)' : 'MISSING');
    console.log('  User:', user ? 'EXISTS (' + user + ')' : 'MISSING');

    if(token && token.length > 0 && user && user.length > 0){
      console.log('✅ AUTHENTICATED - Showing app, hiding login');
      if(loginPage){
        loginPage.style.display = 'none';
        loginPage.style.visibility = 'hidden';
        loginPage.style.pointerEvents = 'none';
        loginPage.classList.add('hidden');
      }
      if(app){
        app.style.display = 'flex';
        app.style.visibility = 'visible';
        app.style.pointerEvents = 'auto';
        app.classList.remove('hidden');
      }
      var userEl = document.getElementById('loggedInUser');
      if(userEl) userEl.textContent = user;
      console.log('✅ App shown successfully');
    } else {
      console.log('❌ NOT AUTHENTICATED - Showing login, hiding app');
      if(loginPage){
        loginPage.style.display = 'flex';
        loginPage.style.visibility = 'visible';
        loginPage.style.pointerEvents = 'auto';
        loginPage.classList.remove('hidden');
      }
      if(app){
        app.style.display = 'none';
        app.style.visibility = 'hidden';
        app.style.pointerEvents = 'none';
        app.classList.add('hidden');
      }
      console.log('❌ Login page shown');
    }
  }, 150);
}

function handleLogin(e){
  e.preventDefault();
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value.trim();
  var btn = document.getElementById('loginBtn');
  var btnText = document.getElementById('loginBtnText');
  var errorEl = document.getElementById('loginError');

  if(!username || !password){
    errorEl.textContent = '⚠️ Please enter username and password';
    return;
  }

  console.log('Login attempt for user:', username);
  btn.disabled = true;
  btnText.innerHTML = '<span class="login-spinner"></span>';
  errorEl.textContent = '';

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, password: password })
  })
  .then(function(res){
    console.log('Login response status:', res.status);
    return res.json();
  })
  .then(function(data){
    console.log('Login response:', data);
    if(data.success && data.token){
      console.log('✅ Login successful for ' + data.user);
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('authUser', data.user);

      // Verify token was saved
      var savedToken = localStorage.getItem('authToken');
      var savedUser = localStorage.getItem('authUser');
      console.log('Token saved to localStorage:', !!savedToken);
      console.log('User saved to localStorage:', savedUser);

      errorEl.textContent = '';
      // Give it time to save and then check
      setTimeout(function(){
        console.log('Calling checkAuth after login...');
        checkAuth();
      }, 300);
    } else {
      errorEl.textContent = '❌ ' + (data.error || 'Login failed');
      console.error('Login failed:', data.error);
      btn.disabled = false;
      btnText.textContent = 'Login';
    }
  })
  .catch(function(e){
    console.error('Login network error:', e);
    errorEl.textContent = '❌ Network error: ' + e.message;
    btn.disabled = false;
    btnText.textContent = 'Login';
  });
}

function handleLogout(){
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  checkAuth();
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
}

// Check auth on page load
checkAuth();

// ── Price Chart ─────────────────────────────────────────────────────────────
let priceChartInstance = null;
let priceChartData = [];
var priceChartRange = '24h';

var PRICE_CHART_RANGE_LABELS = {
  '24h': 'Price chart · last 24 hours',
  'week': 'Price chart · last 7 days',
  'month': 'Price chart · last month',
  'year': 'Price chart · last year'
};

function formatPriceChartAxisLabel(d, range) {
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (range === '24h') return d.getHours().toString().padStart(2,'0') + ':00';
  if (range === 'week') return mo[d.getMonth()] + ' ' + d.getDate();
  if (range === 'month') return mo[d.getMonth()] + ' ' + d.getDate();
  return mo[d.getMonth()] + " '" + String(d.getFullYear()).slice(-2);
}

function syncPriceChartRangeButtons() {
  document.querySelectorAll('.pc-range-btn').forEach(function(b){
    var on = b.getAttribute('data-range') === priceChartRange;
    b.style.borderColor = on ? 'var(--gold)' : 'var(--bdr2)';
    b.style.color = on ? 'var(--gold)' : 'var(--txt)';
    b.style.background = on ? 'rgba(240,165,0,0.12)' : 'var(--surf)';
  });
  var title = document.getElementById('priceChartTitle');
  if (title) title.textContent = PRICE_CHART_RANGE_LABELS[priceChartRange] || PRICE_CHART_RANGE_LABELS['24h'];
}

async function fetchPriceData(symbol, range) {
  try {
    if (range) priceChartRange = range;
    try { localStorage.setItem('priceChartRange', priceChartRange); } catch(e) {}
    syncPriceChartRangeButtons();

    const pair = symbol.replace('/', '').toUpperCase();
    const response = await fetch(
      'https://cloudflare-trader-production.up.railway.app/api/price-chart?symbol=' + encodeURIComponent(pair)
        + '&range=' + encodeURIComponent(priceChartRange)
    );
    const data = await response.json();

    if(data.success && data.data) {
      if (data.range) priceChartRange = data.range;
      priceChartData = data.data.map(candle => ({
        time: new Date(candle.time),
        open: parseFloat(candle.open),
        close: parseFloat(candle.close)
      }));
      renderPriceChart();
    }
  } catch(e) {
    console.warn('Failed to fetch price data:', e);
  }
}

function renderPriceChart() {
  const ctx = document.getElementById('priceChart');
  if(!ctx || priceChartData.length === 0) return;

  if(priceChartInstance) priceChartInstance.destroy();

  const labels = priceChartData.map(function(d){ return formatPriceChartAxisLabel(d.time, priceChartRange); });
  const prices = priceChartData.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  var dsLabel = (priceChartRange === '24h') ? 'Price (24h)' : (priceChartRange === 'week') ? 'Price (7d)' : (priceChartRange === 'month') ? 'Price (1M)' : 'Price (1Y)';

  priceChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: dsLabel,
        data: prices,
        borderColor: 'var(--gold)',
        backgroundColor: 'rgba(204,0,0,0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: 'var(--gold)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleColor: 'var(--gold)',
          bodyColor: 'var(--txt)',
          borderColor: 'var(--gold)',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          min: minPrice * 0.99,
          max: maxPrice * 1.01,
          ticks: { color: 'var(--muted)', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: {
            color: 'var(--muted)',
            font: { size: 9 },
            maxTicksLimit: priceChartRange === 'year' ? 12 : priceChartRange === 'month' ? 10 : 8
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// Fetch price data on page load and refresh every 5 minutes
window.addEventListener('load', function() {
  // If the legacy mini price chart exists, it can still run; otherwise we initialize the AI chart panel.
  if (document.getElementById('aiChart')) {
    try { initAiDashboardChart(); } catch(e) { console.warn('initAiDashboardChart failed', e); }
    return;
  }

  try {
    var saved = localStorage.getItem('priceChartRange');
    if (saved && PRICE_CHART_RANGE_LABELS[saved]) priceChartRange = saved;
  } catch(e) {}
  syncPriceChartRangeButtons();

  var wrap = document.getElementById('priceChartRangeBtns');
  if (wrap) {
    wrap.addEventListener('click', function(ev){
      var btn = ev.target.closest('.pc-range-btn');
      if (!btn) return;
      var r = btn.getAttribute('data-range');
      if (!r || r === priceChartRange) return;
      var sym = document.getElementById('currentSymbolLabel')?.textContent || 'BTC/USDT';
      fetchPriceData(sym, r);
    });
  }

  const symbol = document.getElementById('currentSymbolLabel')?.textContent || 'BTC/USDT';
  fetchPriceData(symbol);
  setInterval(function(){
    var sym = document.getElementById('currentSymbolLabel')?.textContent || 'BTC/USDT';
    fetchPriceData(sym);
  }, 5 * 60 * 1000);
});

// ── AI chart panel (Lightweight Charts + Binance + DeepSeek) ────────────────
function initAiDashboardChart() {
  if (!window.LightweightCharts) {
    console.warn('LightweightCharts missing');
    return;
  }
  var chartEl = document.getElementById('aiChart');
  if (!chartEl) return;

  var titleEl = document.getElementById('aiChartTitle');
  var subEl = document.getElementById('aiChartSub');
  var statusEl = document.getElementById('aiChartStatus');
  var symEl = document.getElementById('aiSym');
  var tfEl = document.getElementById('aiTf');
  var rangeEl = document.getElementById('aiRange');
  var btnLoad = document.getElementById('aiLoadBtn');
  var btnAnalyze = document.getElementById('aiAnalyzeBtn');
  var logEl = document.getElementById('aiLog');

  var tgPrice = document.getElementById('aiTgPrice');
  var tgMA = document.getElementById('aiTgMA');
  var tgAI = document.getElementById('aiTgAI');

  function setStatus(t){ if(statusEl) statusEl.textContent = t || ''; }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function safeNum(x){ var n = Number(x); return Number.isFinite(n) ? n : null; }

  // Default symbol from existing trading target if present
  try {
    var current = (document.getElementById('currentSymbolLabel')?.textContent || '').replace('/','').trim();
    if (current) {
      var map = { 'BTCUSDT':'BTCUSDT','ETHUSDT':'ETHUSDT','SOLUSDT':'SOLUSDT','BNBUSDT':'BNBUSDT' };
      var sym = map[current] || (current.endsWith('USDT') ? current : '');
      if (sym && symEl) symEl.value = sym;
    }
  } catch(e) {}

  var chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#060d18' }, textColor: '#e5eefb', fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" },
    grid: { vertLines: { color: 'rgba(36,56,82,0.35)' }, horzLines: { color: 'rgba(36,56,82,0.35)' } },
    rightPriceScale: { borderColor: 'rgba(36,56,82,0.8)' },
    timeScale: { borderColor: 'rgba(36,56,82,0.8)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 }
  });

  var candleSeries = chart.addCandlestickSeries({
    upColor: '#38d39f', downColor: '#f37d8f',
    borderUpColor: '#38d39f', borderDownColor: '#f37d8f',
    wickUpColor: 'rgba(56,211,159,0.9)', wickDownColor: 'rgba(243,125,143,0.9)'
  });
  var priceSeries = chart.addLineSeries({ color: '#f0c27a', lineWidth: 2, priceLineVisible: false });
  var maSeries = chart.addLineSeries({ color: '#e5eefb', lineWidth: 1, priceLineVisible: false });
  var aiSeries = chart.addLineSeries({ color: '#6ec2ff', lineWidth: 2, priceLineVisible: false, visible: false });

  var currentCandles = [];
  var keyLevelLines = [];

  function clearKeyLevels(){
    if(!keyLevelLines || keyLevelLines.length === 0) return;
    try { keyLevelLines.forEach(function(pl){ candleSeries.removePriceLine(pl); }); } catch(e) {}
    keyLevelLines = [];
  }

  function setKeyLevels(levels){
    clearKeyLevels();
    if(!levels) return;
    var buy = safeNum(levels.buy_zone);
    var fair = safeNum(levels.fair_value);
    var res = safeNum(levels.resistance);
    var lines = [];
    if(buy !== null) lines.push({ price: buy, color: 'rgba(56,211,159,0.75)', title: 'Buy zone' });
    if(fair !== null) lines.push({ price: fair, color: 'rgba(240,194,122,0.80)', title: 'Fair value' });
    if(res !== null) lines.push({ price: res, color: 'rgba(243,125,143,0.75)', title: 'Resistance' });
    lines.forEach(function(l){
      var pl = candleSeries.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: l.title
      });
      keyLevelLines.push(pl);
    });
  }

  function setSeriesVisibility(){
    priceSeries.applyOptions({ visible: !!tgPrice?.checked });
    maSeries.applyOptions({ visible: !!tgMA?.checked });
    aiSeries.applyOptions({ visible: !!tgAI?.checked });
  }

  function rangeStartMs(rangeId){
    var now = Date.now();
    var day = 24*60*60*1000;
    if(rangeId === '1w') return now - 7*day;
    if(rangeId === '1m') return now - 30*day;
    if(rangeId === '3m') return now - 90*day;
    if(rangeId === '1y') return now - 365*day;
    if(rangeId === '3y') return now - 3*365*day;
    return 0;
  }

  async function fetchKlines(symbol, interval, startTime){
    var out = [];
    var next = startTime || 0;
    var loops = 0;
    while(true){
      loops++;
      if(loops > 20) break;
      var qs = new URLSearchParams();
      qs.set('symbol', symbol);
      qs.set('interval', interval);
      qs.set('limit', '1000');
      if(next && next > 0) qs.set('startTime', String(next));
      var url = 'https://api.binance.com/api/v3/klines?' + qs.toString();
      var r = await fetch(url);
      if(!r.ok) throw new Error('Binance error ' + r.status);
      var arr = await r.json();
      if(!Array.isArray(arr) || arr.length === 0) break;
      out = out.concat(arr);
      if(arr.length < 1000) break;
      var lastOpen = Number(arr[arr.length - 1][0]) || 0;
      if(!lastOpen) break;
      var newNext = lastOpen + 1;
      if(newNext <= next) break;
      next = newNext;
      if(out.length >= 5000) break;
    }
    return out;
  }

  function normalizeKlines(arr){
    return arr.map(function(k){
      var t = Number(k[0]);
      return { t: t, o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) };
    }).filter(function(c){
      return Number.isFinite(c.t)&&Number.isFinite(c.o)&&Number.isFinite(c.h)&&Number.isFinite(c.l)&&Number.isFinite(c.c)&&Number.isFinite(c.v);
    });
  }

  function toCandleData(candles){
    return candles.map(function(c){
      return { time: Math.floor(c.t/1000), open: c.o, high: c.h, low: c.l, close: c.c };
    });
  }

  function toLineClose(candles){
    return candles.map(function(c){ return { time: Math.floor(c.t/1000), value: c.c }; });
  }

  function computeMA(candles, period){
    var out = [];
    var sum = 0;
    for(var i=0;i<candles.length;i++){
      sum += candles[i].c;
      if(i >= period) sum -= candles[i - period].c;
      if(i >= period - 1){
        out.push({ time: Math.floor(candles[i].t/1000), value: sum / period });
      }
    }
    return out;
  }

  function alignIndicator(values, candles){
    if(!Array.isArray(values) || !candles || candles.length === 0) return [];
    var n = candles.length;
    var vals = values.map(function(x){ return safeNum(x); }).filter(function(x){ return x !== null; });
    if(vals.length === 0) return [];
    if(vals.length > n) vals = vals.slice(vals.length - n);
    if(vals.length < n){
      var pad = new Array(n - vals.length);
      for(var i=0;i<pad.length;i++) pad[i] = vals[0];
      vals = pad.concat(vals);
    }
    var out = [];
    for(var j=0;j<n;j++){
      out.push({ time: Math.floor(candles[j].t/1000), value: vals[j] });
    }
    return out;
  }

  function setSubtitle(){
    if(!subEl) return;
    var sym = symEl?.value || '--';
    var tf = tfEl?.value || '--';
    var rng = rangeEl?.options?.[rangeEl.selectedIndex]?.text || '--';
    subEl.textContent = sym + ' · ' + tf + ' · ' + rng;
  }

  async function loadChart(){
    setSubtitle();
    setStatus('Loading candles...');
    btnLoad && (btnLoad.disabled = true);
    btnAnalyze && (btnAnalyze.disabled = true);
    try {
      var symbol = symEl.value;
      var interval = tfEl.value;
      var start = rangeStartMs(rangeEl.value);
      var raw = await fetchKlines(symbol, interval, start);
      var candles = normalizeKlines(raw);
      if(start && start > 0) candles = candles.filter(function(c){ return c.t >= start; });
      if(candles.length < 30) throw new Error('Not enough candles returned');
      currentCandles = candles;

      candleSeries.setData(toCandleData(candles));
      priceSeries.setData(toLineClose(candles));
      maSeries.setData(computeMA(candles, 200));
      aiSeries.setData([]);
      aiSeries.applyOptions({ visible: false, color: '#6ec2ff' });
      tgAI && (tgAI.checked = false);
      clearKeyLevels();
      setSeriesVisibility();
      chart.timeScale().fitContent();
      setStatus('Loaded ' + candles.length + ' candles');
    } finally {
      btnLoad && (btnLoad.disabled = false);
      btnAnalyze && (btnAnalyze.disabled = false);
    }
  }

  async function analyze(){
    if(!currentCandles || currentCandles.length < 50){
      alert('Load more candle data first (need at least 50).');
      return;
    }
    setStatus('Analyzing...');
    btnAnalyze && (btnAnalyze.disabled = true);
    try {
      var symbol = symEl.value;
      var timeframe = tfEl.value;
      var last = currentCandles.slice(Math.max(0, currentCandles.length - 200));
      var payload = { symbol: symbol, timeframe: timeframe, candles: last };
      var r = await fetch('/api/chart/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var d = await r.json();
      if(!r.ok) throw new Error(d && d.error ? d.error : ('HTTP ' + r.status));

      setKeyLevels(d.key_levels || {});
      if(d.custom_indicator && Array.isArray(d.custom_indicator.values)){
        var color = d.custom_indicator.color || '#6ec2ff';
        var aligned = alignIndicator(d.custom_indicator.values, currentCandles);
        if(aligned.length > 0){
          aiSeries.applyOptions({ color: color, visible: true });
          aiSeries.setData(aligned);
          tgAI && (tgAI.checked = true);
        }
      }
      setSeriesVisibility();
      setStatus('AI: ' + String(d.recommendation || 'OK') + ' · conf ' + clamp(Number(d.confidence)||0,0,100) + '%');

      // Save last 5 analyses (dashboard-specific key)
      try {
        var key = 'analysis_history_v1:dashboard:' + symbol + ':' + timeframe;
        var arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        arr.unshift(Object.assign({}, d, { when: new Date().toLocaleString() }));
        arr = arr.slice(0, 5);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch(e) {}

      if (logEl && logEl.checked) console.log('AI chart analysis', d);
    } catch(e){
      console.error(e);
      alert('AI analyze failed: ' + e.message);
      setStatus('Analyze failed');
    } finally {
      btnAnalyze && (btnAnalyze.disabled = false);
    }
  }

  function resize(){
    chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight });
  }

  if (tgPrice) tgPrice.addEventListener('change', setSeriesVisibility);
  if (tgMA) tgMA.addEventListener('change', setSeriesVisibility);
  if (tgAI) tgAI.addEventListener('change', setSeriesVisibility);
  if (btnLoad) btnLoad.addEventListener('click', loadChart);
  if (btnAnalyze) btnAnalyze.addEventListener('click', analyze);
  if (symEl) symEl.addEventListener('change', setSubtitle);
  if (tfEl) tfEl.addEventListener('change', setSubtitle);
  if (rangeEl) rangeEl.addEventListener('change', setSubtitle);
  if (logEl) logEl.addEventListener('change', function(){});

  if (document.getElementById('aiLog')) {
    document.getElementById('aiLog').addEventListener('change', function(){
      chart.applyOptions({ rightPriceScale: { mode: this.checked ? 1 : 0 } });
    });
  }

  window.addEventListener('resize', function(){ resize(); });
  resize();
  setSeriesVisibility();
  setSubtitle();
  loadChart();
}

// ── Advanced Settings ──────────────────────────────────────────────────────
function loadAdvancedSettings(){
  try{
    var bitgetKey = localStorage.getItem('api_bitget_key') || '';
    var bitgetSecret = localStorage.getItem('api_bitget_secret') || '';
    var deepseekKey = localStorage.getItem('api_deepseek_key') || '';
    var maxTrade = localStorage.getItem('cfg_max_trade') || '1000';
    var stopLoss = localStorage.getItem('cfg_stop_loss') || '2';
    var takeProfit = localStorage.getItem('cfg_take_profit') || '5';
    var confidence = localStorage.getItem('cfg_confidence') || '70';
    var notifyTrades = localStorage.getItem('cfg_notify_trades') !== 'false';
    var notifyErrors = localStorage.getItem('cfg_notify_errors') !== 'false';

    if(document.getElementById('api-bitget-key')) document.getElementById('api-bitget-key').value = bitgetKey;
    if(document.getElementById('api-bitget-secret')) document.getElementById('api-bitget-secret').value = bitgetSecret;
    if(document.getElementById('api-deepseek-key')) document.getElementById('api-deepseek-key').value = deepseekKey;
    if(document.getElementById('cfg-max-trade')) document.getElementById('cfg-max-trade').value = maxTrade;
    if(document.getElementById('cfg-stop-loss')) document.getElementById('cfg-stop-loss').value = stopLoss;
    if(document.getElementById('cfg-take-profit')) document.getElementById('cfg-take-profit').value = takeProfit;
    if(document.getElementById('cfg-confidence')) document.getElementById('cfg-confidence').value = confidence;
    if(document.getElementById('cfg-notify-trades')) document.getElementById('cfg-notify-trades').checked = notifyTrades;
    if(document.getElementById('cfg-notify-errors')) document.getElementById('cfg-notify-errors').checked = notifyErrors;
  }catch(e){
    console.warn('Failed to load advanced settings:', e);
  }
}

async function saveAdvancedSettings(){
  try{
    var bitgetKey = document.getElementById('api-bitget-key').value || '';
    var bitgetSecret = document.getElementById('api-bitget-secret').value || '';
    var deepseekKey = document.getElementById('api-deepseek-key').value || '';
    var maxTrade = document.getElementById('cfg-max-trade').value || '1000';
    var stopLoss = document.getElementById('cfg-stop-loss').value || '2';
    var takeProfit = document.getElementById('cfg-take-profit').value || '5';
    var confidence = document.getElementById('cfg-confidence').value || '70';
    var notifyTrades = document.getElementById('cfg-notify-trades').checked;
    var notifyErrors = document.getElementById('cfg-notify-errors').checked;

    // Save to localStorage
    localStorage.setItem('api_bitget_key', bitgetKey);
    localStorage.setItem('api_bitget_secret', bitgetSecret);
    localStorage.setItem('api_deepseek_key', deepseekKey);
    localStorage.setItem('cfg_max_trade', maxTrade);
    localStorage.setItem('cfg_stop_loss', stopLoss);
    localStorage.setItem('cfg_take_profit', takeProfit);
    localStorage.setItem('cfg_confidence', confidence);
    localStorage.setItem('cfg_notify_trades', notifyTrades);
    localStorage.setItem('cfg_notify_errors', notifyErrors);

    // Save to KV (Cloudflare Workers)
    if(bitgetKey && bitgetSecret) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bitget_api_key: bitgetKey,
          bitget_api_secret: bitgetSecret
        })
      });
    }

    // Update button feedback
    var btn = document.querySelector('button[onclick="saveAdvancedSettings()"]');
    if(btn) {
      var origText = btn.textContent;
      btn.textContent = '✓ Saved!';
      btn.style.background = 'linear-gradient(135deg,#00c853,#00e676)';
      setTimeout(function(){
        btn.textContent = origText;
        btn.style.background = 'linear-gradient(135deg,#00c853,#00e676)';
      }, 2000);
    }

    console.log('✓ Advanced settings saved');
  }catch(e){
    console.error('Failed to save settings:', e);
    alert('Error saving settings: ' + e.message);
  }
}

// ── Kill Switch (Bot Control) ──────────────────────────────────────────────
function loadKillSwitchStatus(){
  fetch('/api/bot/status')
    .then(function(r){ return r.json(); })
    .then(updateKillSwitchUI)
    .catch(function(e){ console.error('Kill switch status error:', e); });
}
function toggleKillSwitch(){
  fetch('/api/bot/toggle', { method: 'POST' })
    .then(function(r){ return r.json(); })
    .then(updateKillSwitchUI)
    .catch(function(e){ console.error('Kill switch toggle error:', e); });
}
function updateKillSwitchUI(data){
  var btn = document.getElementById('killSwitchBtn');
  var status = document.getElementById('killSwitchStatus');
  if (!btn) return;
  if (data.enabled) {
    btn.textContent = 'STOP BOT';
    btn.style.background = 'var(--red)';
    status.textContent = '● Bot is running — analyzes every 5 minutes';
    status.style.color = 'var(--green)';
  } else {
    btn.textContent = 'START BOT';
    btn.style.background = 'var(--green)';
    status.textContent = '○ Bot is stopped — no automated trading';
    status.style.color = 'var(--red)';
  }
}
loadKillSwitchStatus();

// ── Fetch Bitget Balance (Railway returns totalUSD / totalMYR, not usdtBalance) ──
function formatLiveBalanceDisplay(data){
  if(!data || !data.success) return null;
  var balanceUSD = parseFloat(data.totalUSD) || 0;
  var balanceMYR = parseFloat(data.totalMYR) || 0;
  return '$' + balanceUSD.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + ' USD / RM' + balanceMYR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}

function applyLiveBalanceToUI(data){
  var displayText = formatLiveBalanceDisplay(data);
  if(!displayText) return false;
  var elPf = document.getElementById('pf-bal');
  var elPt = document.getElementById('pt-balance');
  if(elPf) elPf.textContent = displayText;
  if(elPt) elPt.textContent = displayText;
  return true;
}

function updateBitgetBalance(){
  fetch('https://cloudflare-trader-production.up.railway.app/api/bitget-balance')
    .then(function(res){ return res.json(); })
    .then(function(data){
      console.log('Bitget balance response:', data);
      if(applyLiveBalanceToUI(data)){
        console.log('✅ Bitget balance updated');
      } else {
        console.error('❌ Failed to fetch Bitget balance - Full response:', JSON.stringify(data, null, 2));
      }
    })
    .catch(function(e){ console.error('Balance fetch error:', e); });
}

// ── Fetch AI Confidence ────────────────────────────────────────────────────
function updateAIConfidence(){
  fetch('/api/intelligence-logs?limit=1')
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.logs && data.logs.length > 0){
        var latest = data.logs[0];
        var conf = latest.confidence || 0;
        var rec = latest.recommendation || '--';

        // Confidence color
        var confColor = conf >= 75 ? 'var(--green)' : conf >= 50 ? 'var(--gold)' : 'var(--red)';
        document.getElementById('pf-conf').textContent = conf + '%';
        document.getElementById('pf-conf').style.color = confColor;

        // Signal Strength (Strong/Weak based on confidence + recommendation)
        var strength = '--';
        var strengthColor = 'var(--muted)';

        if(rec !== 'HOLD' && conf >= 75){
          strength = (rec === 'BUY' ? '🟢' : '🔴') + ' Strong ' + rec;
          strengthColor = rec === 'BUY' ? 'var(--green)' : 'var(--red)';
        } else if(rec !== 'HOLD' && conf >= 50){
          strength = (rec === 'BUY' ? '⚪' : '⚫') + ' Weak ' + rec;
          strengthColor = rec === 'BUY' ? 'var(--cyan)' : 'var(--yellow)';
        } else {
          strength = '➡️ NEUTRAL';
          strengthColor = 'var(--gold)';
        }

        document.getElementById('pf-strength').textContent = strength;
        document.getElementById('pf-strength').style.color = strengthColor;

        // Status Badge
        var status = '--';
        var statusColor = 'var(--muted)';

        if(conf >= 75 && rec !== 'HOLD'){
          status = '✓ Ready to Trade';
          statusColor = 'var(--green)';
        } else if(conf >= 50 && rec !== 'HOLD'){
          status = '⚠ Uncertain';
          statusColor = 'var(--yellow)';
        } else {
          status = '⏳ Waiting';
          statusColor = 'var(--muted)';
        }

        document.getElementById('pf-status').textContent = status;
        document.getElementById('pf-status').style.color = statusColor;
      }
    })
    .catch(function(e){ console.error('Confidence fetch error:', e); });
}

// ── Crypto Pair Selection ──────────────────────────────────────────────────
var CRYPTO_PAIRS = [
  { sym:'BTCUSDT', label:'BTC/USDT', name:'Bitcoin' },
  { sym:'ETHUSDT', label:'ETH/USDT', name:'Ethereum' },
  { sym:'SOLUSDT', label:'SOL/USDT', name:'Solana' },
  { sym:'BNBUSDT', label:'BNB/USDT', name:'BNB' },
  { sym:'XRPUSDT', label:'XRP/USDT', name:'Ripple' },
  { sym:'DOGEUSDT', label:'DOGE/USDT', name:'Dogecoin' },
  { sym:'ADAUSDT', label:'ADA/USDT', name:'Cardano' },
  { sym:'AVAXUSDT', label:'AVAX/USDT', name:'Avalanche' },
  { sym:'LINKUSDT', label:'LINK/USDT', name:'Chainlink' },
  { sym:'LTCUSDT', label:'LTC/USDT', name:'Litecoin' },
  { sym:'PEPEUSDT', label:'PEPE/USDT', name:'Pepe' },
  { sym:'WIFUSDT', label:'WIF/USDT', name:'dogwifhat' },
  { sym:'TONUSDT', label:'TON/USDT', name:'Toncoin' },
  { sym:'DOTUSDT', label:'DOT/USDT', name:'Polkadot' },
  { sym:'MATICUSDT', label:'MATIC/USDT', name:'Polygon' },
];
var currentTradingSymbol = 'BTCUSDT';

function loadCurrentSymbol(){
  fetch('/api/settings/symbol')
    .then(function(r){ return r.json(); })
    .then(function(d){
      currentTradingSymbol = d.symbol;
      updateSymbolDisplay();
      var pair = CRYPTO_PAIRS.find(function(p){ return p.sym === currentTradingSymbol; }) || CRYPTO_PAIRS[0];
      fetchPriceData(pair.label);
    })
    .catch(function(e){ console.error('Symbol load error:', e); });
}

function updateSymbolDisplay(){
  var pair = CRYPTO_PAIRS.find(function(p){ return p.sym === currentTradingSymbol; }) || CRYPTO_PAIRS[0];
  document.getElementById('currentSymbolLabel').textContent = pair.label;
  document.getElementById('currentSymbolName').textContent = pair.name;
  var labelEl = document.getElementById('ch-label-sym');
  if(labelEl) labelEl.textContent = pair.label;
  var cryptoNameEl = document.querySelector('div[style*="display:flex"][style*="align-items:center"][style*="gap:0.5rem"] span:first-of-type');
  if(cryptoNameEl) cryptoNameEl.textContent = pair.name;
}

function openSymbolPicker(){
  try {
    var picker = document.getElementById('symbolPicker');
    if(!picker) {
      console.error('Symbol picker element not found');
      return;
    }
    picker.style.display = 'flex';
    var search = document.getElementById('symbolSearch');
    if(search) search.value = '';
    filterSymbols();
    if(search) search.focus();
    console.log('Symbol picker opened');
  } catch(e) {
    console.error('Error opening symbol picker:', e);
  }
}

function closeSymbolPicker(){
  try {
    var picker = document.getElementById('symbolPicker');
    if(picker) picker.style.display = 'none';
    console.log('Symbol picker closed');
  } catch(e) {
    console.error('Error closing symbol picker:', e);
  }
}

function filterSymbols(){
  var q = document.getElementById('symbolSearch').value.toLowerCase();
  var filtered = CRYPTO_PAIRS.filter(function(p){ return p.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q); });
  var html = filtered.map(function(p){
    var isActive = p.sym === currentTradingSymbol;
    var bgColor = isActive ? 'var(--card2)' : 'transparent';
    var borderColor = isActive ? 'var(--gold)' : 'var(--bdr)';
    var activeSpan = isActive ? '<span style="color:var(--gold);font-size:0.7rem;font-weight:700">✓ ACTIVE</span>' : '';
    return '<div class="sym-item" data-sym="' + p.sym + '" style="padding:0.65rem 0.75rem;border-radius:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;background:' + bgColor + ';border:1px solid ' + borderColor + ';transition:all 0.15s"><div><div style="font-weight:700;font-size:0.85rem;color:#fff">' + p.label + '</div><div style="font-size:0.7rem;color:var(--muted)">' + p.name + '</div></div>' + activeSpan + '</div>';
  }).join('');
  document.getElementById('symbolList').innerHTML = html || '<div style="color:var(--muted);padding:1rem;text-align:center;font-size:0.75rem">No pairs found</div>';

  document.querySelectorAll('.sym-item').forEach(function(el){
    el.onclick = function(){
      selectSymbol(this.getAttribute('data-sym'));
    };
  });
}

function selectSymbol(sym){
  console.log('Selecting symbol:', sym);
  fetch('/api/settings/symbol', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ symbol: sym })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    console.log('Symbol selection response:', d);
    if(d.success){
      currentTradingSymbol = sym;
      updateSymbolDisplay();
      closeSymbolPicker();
      S.candles = [];
      fetchCandles('15m', 60);
      fetchAI();
      var pair = CRYPTO_PAIRS.find(function(p){ return p.sym === sym; });
      if (pair) fetchPriceData(pair.label);
      else fetchPriceData(sym.replace('USDT', '') + '/USDT');
      console.log('Symbol changed to:', sym);
    } else {
      console.error('Symbol selection failed:', d.error);
      alert('Failed to change symbol: ' + (d.error || 'Unknown error'));
    }
  })
  .catch(function(e){
    console.error('Symbol selection error:', e);
    alert('Error changing symbol: ' + e.message);
  });
}

loadCurrentSymbol();

// ── Update Trade History ───────────────────────────────────────────────────
function updateTradeHistory(){
  fetch('/api/bitget/trades')
    .then(function(res){ return res.json(); })
    .then(function(data){
      var container = document.getElementById('logWrap');
      if(!data.trades || data.trades.length === 0){
        container.innerHTML = '<div style="color:var(--muted);font-size:.7rem;text-align:center;padding:.5rem">No trades yet</div>';
        return;
      }
      var html = '';
      data.trades.slice(0, 15).forEach(function(trade){
        var ts = new Date(trade.timestamp);
        var timeStr = ts.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
        var dateStr = ts.toLocaleDateString('en-US',{month:'short',day:'numeric'});
        var rec = (trade.action || trade.side || 'BUY').toUpperCase();
        var conf = trade.confidence || 0;
        var recColor = rec === 'BUY' || rec === 'LONG' ? 'var(--green)' : rec === 'SELL' || rec === 'SHORT' ? 'var(--red)' : 'var(--gold)';
        var risk = trade.risk_level || 'MEDIUM';
        var entry = trade.entry_price || trade.price || 'MARKET';
        var pnl = trade.pnl ? (trade.pnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)';

        html += '<div class="le ' + rec + '" style="padding:8px;border-bottom:1px solid var(--bdr);font-size:0.7rem">'
          + '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
          + '<span style="color:' + recColor + ';font-weight:700">' + rec + ' ' + (trade.symbol || 'BTC') + '</span>'
          + '<span style="color:var(--muted)">' + dateStr + ' ' + timeStr + '</span>'
          + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:0.65rem;color:var(--muted)">'
          + '<div>Entry: <span style="color:#fff">' + entry + '</span></div>'
          + '<div>Conf: <span style="color:var(--gold)">' + conf + '%</span></div>'
          + '<div>Risk: <span style="color:' + (risk === 'LOW' ? 'var(--green)' : risk === 'HIGH' ? 'var(--red)' : 'var(--yellow)') + '">' + risk + '</span></div>'
          + '</div>'
          + '</div>';
      });
      container.innerHTML = html;
    })
    .catch(function(e){ console.error('Trade history fetch error:', e); });
}

// Update balance every 30 seconds
setInterval(updateBitgetBalance, 30000);
// Update confidence every 10 seconds
setInterval(updateAIConfidence, 10000);
// Update trade history every 15 seconds
setInterval(updateTradeHistory, 15000);
// Update portfolio every 30 seconds if visible
setInterval(function(){ if(document.getElementById('tab-portfolio').classList.contains('active')) updatePortfolioTab(); }, 30000);
// Update immediately on page load
setTimeout(updateBitgetBalance, 500);
setTimeout(updateAIConfidence, 500);
setTimeout(updateTradeHistory, 500);
setTimeout(updatePortfolioTab, 1000);

var S = {
  candles:[],lastP:43250,prevP:43250,lastDisplayedP:43250,
  high24:44500,low24:42000,
  bal:10000,pnl:0,pos:0,wins:0,tots:0,best:0,
  cd:15,logs:[],buySig:0,sellSig:0,holdSig:0,
  trades:[],flow:50
};
var COINS = {
  BTC:{p:43250,b:43250,d:2},ETH:{p:2280,b:2280,d:2},
  SOL:{p:98.4,b:98.4,d:2},BNB:{p:385,b:385,d:2},
  DOGE:{p:0.128,b:0.128,d:4},ADA:{p:0.451,b:0.451,d:4},
  AVAX:{p:36.2,b:36.2,d:2},MATIC:{p:0.884,b:0.884,d:4},
  LINK:{p:14.6,b:14.6,d:2},LTC:{p:82.4,b:82.4,d:2}
};
var SPARK_SYMS = ['ETH','BNB','SOL','DOGE','ADA','AVAX'];
var sparkData = {};
SPARK_SYMS.forEach(function(s){ sparkData[s] = Array(20).fill(COINS[s].p); });
var chartType = 'Candle';
var activeSparkSymbol = 'ETH';

// Clock
setInterval(function(){
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-US',{hour12:false});
}, 1000);

// Countdown
setInterval(function(){
  S.cd--;
  document.getElementById('countdown').textContent = S.cd + 's';
  if(S.cd <= 0){ S.cd = 15; fetchAI(); }
}, 1000);

// Ticker is now driven by fetchTicker() using real Binance data (called in init)

// Sparklines
function buildSparkList(){
  var html = '';
  SPARK_SYMS.forEach(function(sym){
    var isActive = sym === activeSparkSymbol;
    var bgColor = isActive ? 'rgba(0,212,255,0.15)' : 'var(--card2)';
    var borderColor = isActive ? '1px solid rgba(0,212,255,0.5)' : '1px solid transparent';
    html += '<div class="spark-item" id="spark-' + sym + '" data-sym="' + sym + '" style="cursor:pointer;background:' + bgColor + ';border:' + borderColor + ';transition:all 0.2s">'
      + '<span class="spark-sym" style="color:' + (isActive ? '#00d4ff' : 'var(--muted)') + ';font-weight:' + (isActive ? '800' : '700') + '">' + sym + '</span>'
      + '<canvas class="spark-canvas" id="spk-' + sym + '" width="60" height="22"></canvas>'
      + '<span class="spark-price" id="spkp-' + sym + '" style="color:' + (isActive ? '#00d4ff' : 'var(--muted)') + '">$' + COINS[sym].p.toFixed(COINS[sym].d) + '</span>'
      + '</div>';
  });
  document.getElementById('sparkList').innerHTML = html;

  // Add click listeners
  document.querySelectorAll('.spark-item').forEach(function(el){
    el.addEventListener('click', function(){
      switchSparkSymbol(this.dataset.sym);
    });
  });
}

function switchSparkSymbol(sym){
  activeSparkSymbol = sym;
  currentTradingSymbol = sym + 'USDT';
  updateSymbolDisplay();
  buildSparkList();
  renderSparks();
  fetchPriceData(sym + '/USDT');
  console.log('🔄 Switched trading target to ' + sym);
  setTimeout(function(){ fetchAI(); }, 300);
}

function renderSparks(){
  SPARK_SYMS.forEach(function(sym){
    var canvas = document.getElementById('spk-' + sym);
    if(!canvas) return;
    var ctx = canvas.getContext('2d');
    var data = sparkData[sym];
    var W = 60, H = 22;
    ctx.clearRect(0,0,W,H);
    var mn = Math.min.apply(null,data), mx = Math.max.apply(null,data), rng = mx - mn || 1;
    var isUp = data[data.length-1] >= data[0];
    ctx.beginPath();
    ctx.strokeStyle = isUp ? '#00e676' : '#ff2d55';
    ctx.lineWidth = 1.5;
    data.forEach(function(v,i){
      var x = i / (data.length-1) * W;
      var y = H - ((v - mn) / rng) * (H-2) - 1;
      if(i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    var pe = document.getElementById('spkp-' + sym);
    if(pe) pe.textContent = '$' + COINS[sym].p.toFixed(COINS[sym].d);
  });
}

// Fetch price from Bitget via our API endpoint
function fetchBitgetPrice(){
  var symbol = currentTradingSymbol || 'BTCUSDT';
  fetch('/api/bitget/price?symbol=' + symbol)
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.success){
        var changeData = {
          price: data.price,
          change24h: data.change24h
        };
        updatePriceDisplay(changeData);
        console.log('✅ Bitget price fetched:', changeData);
      } else {
        console.warn('Bitget price error:', data.error);
      }
    })
    .catch(function(e){ console.warn('Bitget price fetch failed:', e.message); });
}

function updatePriceDisplay(data){
  var pe = document.getElementById('ch-price');
  var ce = document.getElementById('ch-change');

  if(pe) pe.textContent = '$' + data.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if(pe) {
    pe.style.color = data.change24h >= 0 ? 'var(--green)' : 'var(--red)';
    setTimeout(function(){ if(pe) pe.style.color = '#fff'; }, 700);
  }

  if(ce) {
    var change24hFixed = parseFloat(data.change24h).toFixed(2);
    ce.textContent = (data.change24h >= 0 ? '+' : '') + change24hFixed + '%';
    ce.className = 'ch-change ' + (data.change24h >= 0 ? 'pos' : 'neg');
    console.log('📊 Price display updated from Bitget:', { price: data.price, change24h: change24hFixed + '%' });
  }
}

// Fetch AI
function fetchAI(){
  fetchWithTimeout('/api/prediction')
    .then(function(r){ return r.json(); })
    .then(function(d){ applyAI(d); })
    .catch(function(e){ console.warn('AI fetch failed:', e.message); });

  // Also fetch price from Bitget
  fetchBitgetPrice();
}

function applyAI(d){
  S.prevP = S.lastP; S.lastP = d.price;
  COINS.BTC.p = d.price;

  var candle = {
    t: Date.now(), o: S.prevP,
    h: Math.max(d.price, S.prevP) * 1.001,
    l: Math.min(d.price, S.prevP) * 0.999,
    c: d.price
  };
  S.candles.push(candle);
  if(S.candles.length > 60) S.candles.shift();
  if(d.price > S.high24) S.high24 = d.price;
  if(d.price < S.low24)  S.low24  = d.price;

  var pe = document.getElementById('ch-price');
  if(pe) pe.textContent = '$' + d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

  var hero = document.getElementById('sigHero');
  hero.className = 'sig-hero ' + d.sig;
  document.getElementById('sigWord').textContent  = d.sig;
  document.getElementById('sigPrice').textContent = '@ $' + d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('ai-ts').textContent = new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});

  var arc = 138;
  var fill = document.getElementById('gaugeFill');
  var num  = document.getElementById('gaugeNum');
  fill.style.strokeDashoffset = arc - (arc * (d.confidence/100));
  var col = d.sig === 'BUY' ? 'var(--green)' : d.sig === 'SELL' ? 'var(--red)' : 'var(--yellow)';
  fill.style.stroke = col;
  num.style.fill    = col;
  num.textContent   = d.confidence + '%';

  var rsiEl = document.getElementById('c-rsi');
  rsiEl.textContent = d.rsi;
  rsiEl.style.color = d.rsi > 70 ? 'var(--red)' : d.rsi < 30 ? 'var(--green)' : '#fff';
  var macdEl = document.getElementById('c-macd');
  macdEl.textContent = d.macd > 0 ? '+' + d.macd : d.macd;
  macdEl.style.color = d.macd > 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('c-bb').textContent  = d.bb_pos + '%';
  document.getElementById('c-ema').textContent = '$' + parseFloat(d.ema20).toFixed(0);
  document.getElementById('c-vol').textContent = (d.volume/1000).toFixed(1) + 'K';
  var trendEl = document.getElementById('c-trend');
  trendEl.textContent = d.sig === 'BUY' ? 'Bull' : d.sig === 'SELL' ? 'Bear' : 'Side';
  trendEl.style.color = col;

  // Calculate buy/sell ratio from latest agent results and win rate
  var buySignals = 0, sellSignals = 0, holdSignals = 0;

  // Note: Intelligence logs are server-side, not accessible from browser
  // Default to equal distribution
  buySignals = 1;
  sellSignals = 1;
  holdSignals = 1;

  // Calculate percentage: more buy signals = higher buy %
  var totalSignals = buySignals + sellSignals + holdSignals;
  var buyPct = totalSignals > 0 ? Math.round((buySignals / totalSignals) * 100) : 50;

  // Smooth the transition (don't jump too much)
  S.flow = S.flow + (buyPct - S.flow) * 0.2;
  S.flow = Math.max(15, Math.min(85, S.flow));

  var bp = Math.round(S.flow);
  document.getElementById('flow-buy').style.width  = bp + '%';
  document.getElementById('flow-sell').style.width = (100-bp) + '%';
  document.getElementById('flow-pct').textContent  = bp + '%';
}





function refresh(){ S.cd = 15; fetchAI(); }

function setupPremiumMotion(){
  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e) {}
  var selectors = [
    '#tab-dashboard .panel',
    '#tab-dashboard #bottom .bot-col',
    '#tab-portfolio > div > div',
    '#tab-evolution > div > div',
    '#tab-logs > div > div',
    '#tab-agents .agents-grid > *',
    '#tab-settings .settings-section'
  ];
  var targets = [];
  selectors.forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){ targets.push(el); });
  });
  targets.forEach(function(el, idx){
    el.classList.add('reveal-up');
    el.style.transitionDelay = reduce ? '0s' : (Math.min(idx % 8, 7) * 0.05 + 's');
    if (reduce) el.classList.add('in');
  });

  if (reduce) return;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) entry.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    targets.forEach(function(el){ io.observe(el); });
  } else {
    targets.forEach(function(el){ el.classList.add('in'); });
  }
}

// ── Tab Switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    var tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if(tab === 'portfolio') updatePortfolioTab();
    if(tab === 'evolution') updateEvolutionTab();
    if(tab === 'logs') updateLogsTab();
    if(tab === 'agents') updateAgentsTab();

    // Trigger cinematic reveal when switching tabs.
    var panel = document.getElementById('tab-' + tab);
    if (panel) {
      panel.querySelectorAll('.reveal-up').forEach(function(el){
        el.classList.remove('in');
        requestAnimationFrame(function(){ el.classList.add('in'); });
      });
    }
  });
});

function updateAgentsTab(){
  // Refresh agents data from the latest analysis
  updateTradeHistory();
}

// ── Portfolio Tab ──────────────────────────────────────────────────────────
function updatePortfolioTab(){
  // Same Bitget totals as dashboard (must use totalUSD/totalMYR from API)
  fetch('https://cloudflare-trader-production.up.railway.app/api/bitget-balance')
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(!applyLiveBalanceToUI(data)){
        console.warn('Portfolio tab: balance unavailable', data && data.error);
      }
    })
    .catch(function(e){ console.warn('Portfolio balance fetch failed:', e); });

  // Fetch trades for P&L and metrics
  fetch('/api/trades?limit=100')
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.trades && Array.isArray(data.trades)){
        const trades = data.trades;
        const openTrades = trades.filter(function(t){ return t.status === 'OPEN'; });
        const closedTrades = trades.filter(function(t){ return t.status === 'CLOSED'; });

        // Total P&L
        const totalPnL = closedTrades.reduce(function(sum, t){ return sum + (t.pnl || 0); }, 0);
        const pnlEl = document.getElementById('pt-pnl');
        if(pnlEl){
          pnlEl.textContent = (totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toFixed(2);
          pnlEl.style.color = totalPnL >= 0 ? '#00e676' : '#ff6b6b';
        }

        // Open positions
        document.getElementById('pt-open').textContent = openTrades.length.toString();

        // Win rate
        if(closedTrades.length > 0){
          const wins = closedTrades.filter(function(t){ return t.pnl > 0; }).length;
          const winRate = Math.round((wins / closedTrades.length) * 100);
          document.getElementById('pt-win-rate').textContent = winRate + '%';
        }

        // Total trades
        document.getElementById('pt-trades').textContent = trades.length.toString();

        // Update holdings
        updateHoldings(openTrades);

        // Update allocation
        updateAllocation(openTrades);
      }
    })
    .catch(function(e){ console.warn('Portfolio trades fetch failed:', e); });
}

function updateHoldings(trades){
  const holdingsEl = document.getElementById('pt-holdings');
  if(!holdingsEl) return;

  if(trades.length === 0){
    holdingsEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr auto auto;gap:1rem;align-items:center;padding:.75rem;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.05)"><div style="font-size:.75rem;color:var(--muted)">No positions</div></div>';
    return;
  }

  const html = trades.map(function(t){
    const pnl = t.pnl || 0;
    const pnlPct = ((pnl / t.entry_price) * 100).toFixed(2);
    return '<div style="display:grid;grid-template-columns:1fr auto auto;gap:1rem;align-items:center;padding:.75rem;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.05)">'
      + '<div><div style="font-size:.75rem;font-weight:700;color:#fff">' + t.symbol + '</div>'
      + '<div style="font-size:.65rem;color:var(--muted)">' + t.quantity.toFixed(4) + ' @ $' + t.entry_price.toFixed(2) + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:.75rem;font-weight:700;color:' + (pnl >= 0 ? '#00e676' : '#ff6b6b') + '">' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + '</div>'
      + '<div style="font-size:.65rem;color:' + (pnl >= 0 ? '#00e676' : '#ff6b6b') + '">' + (pnlPct >= 0 ? '+' : '') + pnlPct + '%</div></div></div>';
  }).join('');

  holdingsEl.innerHTML = html;
}

function updateAllocation(trades){
  if(trades.length === 0){
    document.getElementById('pt-cash-pct').textContent = '100%';
    document.getElementById('pt-pos-pct').textContent = '0%';
    return;
  }

  const totalPos = trades.reduce(function(sum, t){ return sum + (t.quantity * t.entry_price); }, 0);
  const posPct = totalPos > 0 ? Math.round((totalPos / (totalPos + 10000)) * 100) : 0;
  const cashPct = 100 - posPct;

  document.getElementById('pt-cash-pct').textContent = cashPct + '%';
  document.getElementById('pt-pos-pct').textContent = posPct + '%';
  document.getElementById('pt-risk').textContent = (posPct * 0.02).toFixed(1) + '%';
}

// ── Evolution Tab ──────────────────────────────────────────────────────────
function updateEvolutionTab(){
  fetchEvolutionStatus();
}

function resetEvolutionParams(){
  if(!confirm('Reset parameters to defaults?')) return;
  fetch('/api/evolution/optimize', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reset:true}) })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.success){
        alert('✓ Parameters reset to defaults');
        setTimeout(function(){ fetchEvolutionStatus(); }, 500);
      }else{
        alert('Error: ' + data.error);
      }
    })
    .catch(function(e){ alert('Failed to reset: ' + e.message); });
}

// ── Logs Tab ───────────────────────────────────────────────────────────────
function updateLogsTab(){
  if (typeof window.fetchLogs === 'function') {
    window.fetchLogs();
    return;
  }
  fetch('/api/intelligence-logs?limit=100')
    .then(function(res){ return res.json(); })
    .then(function(data){
      var stream = document.getElementById('log-stream');
      if (!stream) return;
      var rows = (data && Array.isArray(data.logs)) ? data.logs : [];
      if (rows.length === 0) {
        stream.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px 20px"><div style="font-size:3rem;margin-bottom:15px">📝</div><div>No intelligence logs yet.</div><div style="font-size:12px;margin-top:8px">Logs appear after the worker runs multi-agent analysis (scheduled or manual).</div></div>';
        return;
      }
      var html = '';
      rows.forEach(function(log){
        var ts = new Date(log.timestamp || Date.now());
        var tsStr = ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
        var msg = log.headline || log.message || (log.symbol + ' · ' + (log.recommendation || 'HOLD'));
        html += '<div style="background:var(--card);border-left:3px solid var(--gold);border-radius:6px;padding:12px 15px;margin-bottom:8px">'
          + '<div style="color:var(--gold);font-weight:700;font-size:13px">' + (log.symbol || '—') + ' · ' + tsStr + '</div>'
          + '<div style="color:var(--txt);font-size:12px;margin-top:6px">' + msg + '</div></div>';
      });
      stream.innerHTML = html;
    })
    .catch(function(e){
      var stream = document.getElementById('log-stream');
      if (stream) stream.innerHTML = '<div style="color:var(--red);padding:20px">Error loading logs: ' + e.message + '</div>';
    });
}

// ── Log Streaming ──────────────────────────────────────────────────────────
var logStreamActive = false;
var logStreamInterval = null;
var lastLogCount = 0;

function toggleLogStreaming(){
  const btn = document.getElementById('streamToggleBtn');
  if(!btn) return;

  if(logStreamActive){
    // Stop streaming
    logStreamActive = false;
    if(logStreamInterval) clearInterval(logStreamInterval);
    btn.textContent = '▶ STREAM';
    btn.style.background = 'var(--gold)';
    btn.style.color = '#000';
    console.log('Log streaming stopped');
  } else {
    // Start streaming
    logStreamActive = true;
    btn.textContent = '⏹ STOP';
    btn.style.background = 'var(--red)';
    btn.style.color = '#fff';
    lastLogCount = 0;

    // Fetch logs immediately
    fetchAndStreamLogs();

    // Then fetch every 2 seconds
    logStreamInterval = setInterval(fetchAndStreamLogs, 2000);
    console.log('Log streaming started - fetching every 2 seconds');
  }
}

function fetchAndStreamLogs(){
  if(!logStreamActive) return;

  fetch('/api/intelligence-logs?limit=50')
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(!data.logs || data.logs.length === 0) return;

      const container = document.getElementById('log-stream');
      if (!container) return;
      const totalLogs = data.logs.length;

      // Only update if there are new logs
      if(totalLogs > lastLogCount){
        lastLogCount = totalLogs;

        var html = '';
        data.logs.forEach(function(log){
          var ts = new Date(log.timestamp);
          var tsStr = ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
          var recColor = log.recommendation === 'BUY' ? 'var(--green)' : log.recommendation === 'SELL' ? 'var(--red)' : 'var(--gold)';
          var recBg = log.recommendation === 'BUY' ? 'rgba(0,230,118,0.1)' : log.recommendation === 'SELL' ? 'rgba(255,45,85,0.1)' : 'rgba(204,0,0,0.1)';
          var consensusColor = log.market_consensus && log.market_consensus.includes('BULLISH') ? 'var(--green)' : log.market_consensus && log.market_consensus.includes('BEARISH') ? 'var(--red)' : 'var(--muted)';
          html += '<div style="background:var(--card);border:1px solid var(--bdr);border-radius:6px;padding:15px;display:flex;flex-direction:column;gap:10px;animation:slideIn 0.3s ease-out">'
            + '<div style="display:flex;justify-content:space-between;align-items:start">'
            + '<div>'
            + '<div style="color:var(--gold);font-weight:700;font-size:14px">' + (log.symbol || 'N/A') + ' - ' + tsStr + '</div>'
            + '<div style="color:var(--muted);font-size:12px;margin-top:4px">' + (log.intelligence_summary || log.headline || 'Market analysis') + '</div>'
            + '</div>'
            + '<div style="background:' + recBg + ';color:' + recColor + ';padding:4px 12px;border-radius:4px;font-weight:700;font-size:12px">' + (log.recommendation || 'HOLD') + ' (' + (log.confidence || 50) + '%)</div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;font-size:12px">'
            + '<div><span style="color:var(--muted)">Consensus</span><div style="color:' + consensusColor + ';font-weight:700;margin-top:3px">' + (log.market_consensus || 'N/A') + '</div></div>'
            + '<div><span style="color:var(--muted)">Confidence</span><div style="color:var(--gold);font-weight:700;margin-top:3px">' + (log.consensus_level !== undefined ? log.consensus_level + '%' : 'N/A') + '</div></div>'
            + '<div><span style="color:var(--muted)">Risk</span><div style="color:var(--txt);font-weight:700;margin-top:3px">' + (log.risk_level || 'N/A') + '</div></div>'
            + '<div><span style="color:var(--muted)">Signals</span><div style="color:var(--txt);font-weight:700;margin-top:3px">' + (log.key_drivers && log.key_drivers.length > 0 ? log.key_drivers[0] : 'N/A') + '</div></div>'
            + '</div>'
            + '<div style="border-top:1px solid var(--bdr);padding-top:10px;color:var(--muted);font-size:11px">'
            + '<div>Signals: Tech=' + (log.technical_signal || '?') + ' | Sentiment=' + (log.sentiment_signal || '?') + ' | Fund=' + (log.fundamental_signal || '?') + ' | Risk=' + (log.risk_assessment || '?') + '</div>'
            + '</div>'
            + '</div>';
        });
        container.innerHTML = html;
        container.scrollTop = 0; // Auto-scroll to top for new logs
      }
    })
    .catch(function(e){
      console.error('Stream fetch error:', e);
    });
}

// ── Alerts ────────────────────────────────────────────────────────────────
var alerts = [];

function addAlert(){
  var sym   = document.getElementById('al-sym').value;
  var cond  = document.getElementById('al-cond').value;
  var price = parseFloat(document.getElementById('al-price').value);
  if(!price || price <= 0){ alert('Enter a valid price'); return; }
  alerts.push({ id: Date.now(), sym: sym, cond: cond, price: price, status: 'active' });
  document.getElementById('al-price').value = '';
  renderAlerts();
}

function deleteAlert(id){
  alerts = alerts.filter(function(a){ return a.id !== id; });
  renderAlerts();
}

function renderAlerts(){
  var body = document.getElementById('alert-list-body');
  if(!alerts.length){
    body.innerHTML = '<div class="no-alerts">No alerts set. Create one above.</div>';
    return;
  }
  var html = '';
  alerts.forEach(function(a){
    html += '<div class="alert-item">'
      + '<span class="alert-sym">' + a.sym + '</span>'
      + '<span class="alert-cond ' + a.cond + '">' + (a.cond==='above'?'&#9650; Above':'&#9660; Below') + '</span>'
      + '<span class="alert-price">$' + a.price.toLocaleString() + '</span>'
      + '<span class="alert-status ' + a.status + '">' + a.status.toUpperCase() + '</span>'
      + '<button class="alert-del" onclick="deleteAlert(' + String(a.id) + ')">&#10005;</button>'
      + '</div>';
  });
  body.innerHTML = html;
}

function checkAlerts(){
  var triggered = false;
  alerts.forEach(function(a){
    if(a.status !== 'active') return;
    var cp = COINS[a.sym] ? COINS[a.sym].p : 0;
    if((a.cond === 'above' && cp >= a.price) || (a.cond === 'below' && cp <= a.price)){
      a.status = 'triggered';
      triggered = true;
      console.log('Alert triggered: ' + a.sym + ' ' + a.cond + ' $' + a.price);
    }
  });
  if(triggered) renderAlerts();
}
setInterval(checkAlerts, 5000);

// ── Settings ──────────────────────────────────────────────────────────────
var refreshInterval = 15;
var refreshTimer = null;

function applyInterval(){
  refreshInterval = parseInt(document.getElementById('cfg-interval').value);
  S.cd = refreshInterval;
}

// ── Evolution Control ────────────────────────────────────────────────────
const RAILWAY_BASE='https://cloudflare-trader-production.up.railway.app';

function switchPanel(panel){
  const historyPanel = document.getElementById('panel-log');
  const evolutionPanel = document.getElementById('panel-evolution');
  const historyTab = document.getElementById('tab-history');
  const evolutionTab = document.getElementById('tab-evolution');

  if(panel === 'history'){
    historyPanel.style.display = 'flex';
    evolutionPanel.style.display = 'none';
    historyTab.style.borderBottomColor = '#00d4ff';
    evolutionTab.style.borderBottomColor = 'transparent';
  } else {
    historyPanel.style.display = 'none';
    evolutionPanel.style.display = 'flex';
    historyTab.style.borderBottomColor = 'transparent';
    evolutionTab.style.borderBottomColor = '#00d4ff';
  }
}

async function fetchEvolutionStatus(){
  try{
    const url = RAILWAY_BASE + '/api/evolution/status';
    const r = await fetch(url);
    const data = await r.json();
    if(data.success && data.status){
      updateEvolutionUI(data.status);
    }
  }catch(e){
    console.error('Failed to fetch evolution status:',e);
  }
}

function updateEvolutionUI(status){
  const tsEl=document.getElementById('evo-timestamp');
  if(status.last_evolution){
    const d=new Date(status.last_evolution);
    tsEl.textContent=d.toLocaleString('en-US',{hour12:false});
  }else{
    tsEl.textContent='Never';
  }

  document.getElementById('evo-count').textContent=status.evolution_count||0;

  const statusEl=document.getElementById('evo-status');
  statusEl.textContent='Ready';
  statusEl.style.color='#00e676';

  const paramsEl=document.getElementById('evo-params');
  if(status.current_params && typeof status.current_params==='object'){
    const lines=Object.entries(status.current_params).map(function(kv){
      const k = kv[0];
      const v = kv[1];
      const val=typeof v==='number'?v.toFixed(1):v;
      return '<div>' + k + ': <span style="color:#ffd460">' + val + '</span></div>';
    });
    paramsEl.innerHTML=lines.join('');
  }
}

async function approveEvolution(){
  try{
    const btn=event.target;
    btn.disabled=true;
    btn.textContent='⏳ Executing...';

    const url = RAILWAY_BASE + '/api/evolution/optimize';
    const r=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({approve:true})
    });
    const data=await r.json();

    if(data.success){
      btn.textContent='✓ Evolution Running';
      btn.style.opacity='0.7';
      setTimeout(async function(){
        fetchEvolutionStatus();
        btn.disabled=false;
        btn.textContent='✓ Approve';
        btn.style.opacity='1';
      },2000);
    }else{
      btn.textContent='✗ Failed: '+data.error;
      setTimeout(function(){
        btn.disabled=false;
        btn.textContent='✓ Approve';
      },2000);
    }
  }catch(e){
    console.error('Approval failed:',e);
    event.target.textContent='✗ Error';
    setTimeout(function(){event.target.textContent='✓ Approve'},2000);
  }
}

function declineEvolution(){
  alert('Evolution cycle declined and will not execute.');
  console.log('Evolution declined by user');
}

setInterval(fetchEvolutionStatus,30000);

// ── Claude AI Analysis ────────────────────────────────────────────────────
function runClaudeAnalysis(){
  var btn = document.getElementById('btnAnalyze');
  if(!btn) {
    console.error('Analyze button not found');
    return;
  }
  if(btn.classList.contains('loading')) return;

  // Build query from current state
  var currentSymbol = currentTradingSymbol || 'BTCUSDT';
  var baseSymbol = currentSymbol.replace('USDT', '');

  var params = new URLSearchParams({
    symbol:     baseSymbol,
    price:      S.lastP.toFixed(2),
    change:     S.lastP && S.prevP ? ((S.lastP-S.prevP)/S.prevP*100).toFixed(2) : '0',
    rsi:        document.getElementById('c-rsi')  ? document.getElementById('c-rsi').textContent  : '50',
    macd:       document.getElementById('c-macd') ? document.getElementById('c-macd').textContent : '0',
    signal:     document.getElementById('sigWord')? document.getElementById('sigWord').textContent: 'HOLD',
    confidence: document.getElementById('gaugeNum')? document.getElementById('gaugeNum').textContent.replace('%','') : '70',
    volume:     document.getElementById('s-vol')  ? document.getElementById('s-vol').textContent.replace('K','000') : '30000',
    high24:     S.high24.toFixed(2),
    low24:      S.low24.toFixed(2),
    bb_pos:     document.getElementById('c-bb')   ? document.getElementById('c-bb').textContent.replace('%','') : '50',
  });

  btn.classList.add('loading');
  btn.textContent = '⏳ ANALYZING...';
  btn.disabled = true;

  console.log('Starting analysis for ' + currentSymbol + '...');

  fetchWithTimeout('/api/analyze?' + params.toString(), 60000)
    .then(function(r){ return r.json(); })
    .then(function(d){
      console.log('Analysis complete:', d);
      if(d.error){
        alert('Analysis error: ' + d.error);
        return;
      }
      alert('✅ Analysis complete! Check the Logs tab to see results. Click STREAM to watch in real-time.');
      renderAgentResults(d);
    })
    .catch(function(e){
      console.error('Analysis failed:', e);
      alert('Analysis failed: ' + e.message);
    })
    .finally(function(){
      if(btn){
        btn.classList.remove('loading');
        btn.textContent = '▶ RUN ANALYSIS';
        btn.disabled = false;
      }
    });
}

function applyClaudeResult(d){
  document.getElementById('claudeEmpty').style.display  = 'none';
  document.getElementById('claudeResult').style.display = 'block';

  // Recommendation
  var rec = (d.recommendation || 'HOLD').toUpperCase();
  var recEl = document.getElementById('claudeRec');
  recEl.textContent = rec;
  recEl.className   = 'claude-rec ' + rec;

  // Headline
  document.getElementById('claudeHeadline').textContent = d.headline || '';

  // Confidence bar
  var pct = Math.min(100, Math.max(0, d.confidence || 70));
  document.getElementById('claudeConfFill').style.width = pct + '%';
  document.getElementById('claudeConfPct').textContent  = pct + '%';

  // Meta chips
  var risk = (d.risk_level || 'MEDIUM').toUpperCase();
  var meta = document.getElementById('claudeMeta');
  meta.innerHTML =
    '<span class="claude-chip risk-' + risk + '">' + risk + ' RISK</span>' +
    '<span class="claude-chip purple">BTC/USDT</span>' +
    (d.cached ? '<span class="claude-chip purple">&#9889; Cached</span>' : '');

  // Analysis text
  document.getElementById('claudeAnalysisText').textContent = d.analysis || '';

  // Bullish factors
  var bulls = d.bullish_factors || [];
  document.getElementById('claudeBullish').innerHTML = bulls.map(function(f){
    return '<div class="factor-item"><div class="factor-dot bull"></div><span>' + f + '</span></div>';
  }).join('') || '<div style="color:var(--muted);font-size:.72rem">None identified</div>';

  // Bearish factors
  var bears = d.bearish_factors || [];
  document.getElementById('claudeBearish').innerHTML = bears.map(function(f){
    return '<div class="factor-item"><div class="factor-dot bear"></div><span>' + f + '</span></div>';
  }).join('') || '<div style="color:var(--muted);font-size:.72rem">None identified</div>';

  // Targets
  document.getElementById('t-entry').textContent  = d.entry_zone || '--';
  document.getElementById('t-stop').textContent   = d.stop_loss  || '--';
  document.getElementById('t-target').textContent = d.target     || '--';
  document.getElementById('t-tf').textContent     = d.timeframe  || '--';

  // Last updated
  document.getElementById('claudeLastTime').textContent =
    'Last analyzed: ' + new Date().toLocaleTimeString('en-US',{hour12:false});

  // Update Agents tab
  renderAgentResults(d);
}

// ── Agent Results Renderer ──────────────────────────────────────────────────
function renderAgentResults(d) {
  var grid = document.getElementById('agentsGrid');
  if (!grid) return;

  var agentNames = {
    technical:   { icon: '&#128200;', label: 'Technical Analysis' },
    sentiment:  { icon: '&#128172;', label: 'Sentiment Analysis' },
    fundamental:{ icon: '&#127981;', label: 'Fundamental Analysis' },
    risk:       { icon: '&#9878;',  label: 'Risk Management' },
    portfolio:  { icon: '&#128200;', label: 'Portfolio Optimization' }
  };

  if (!d.agents) {
    grid.innerHTML = '<div class="agents-empty"><div class="agents-empty-icon">&#129302;</div><div class="agents-empty-title">Multi-Agent Analysis</div><div class="agents-empty-desc">Run an analysis from the Claude AI tab to see individual agent breakdowns here.</div></div>';
    document.getElementById('agentsAggregated').innerHTML = '';
    return;
  }

  var agentKeys = ['technical', 'sentiment', 'fundamental', 'risk', 'portfolio'];
  var html = '';
  agentKeys.forEach(function(key) {
    var a = d.agents[key];
    if (!a) return;
    var rec = (a.recommendation || 'HOLD').toUpperCase();
    var risk = (a.risk_level || 'MEDIUM').toUpperCase();
    var detail = a.technical_signals ? a.technical_signals.join(', ') :
                 a.sentiment_score !== undefined ? 'Sentiment: ' + a.sentiment_score :
                 a.tokenomics_score !== undefined ? 'Tokenomics: ' + a.tokenomics_score + '/100' :
                 a.position_size ? a.position_size + ' | ' + a.risk_reward_ratio :
                 a.suggested_allocation ? 'Alloc: ' + a.suggested_allocation :
                 a.analysis || '';

    html += '<div class="agent-card">'
      + '<div class="agent-card-head">' + (agentNames[key]?.icon || '&#129302;') + ' ' + (agentNames[key]?.label || key) + '</div>'
      + '<div class="agent-card-body">'
      + '<div class="agent-rec ' + rec + '">' + rec + '</div>'
      + '<div class="agent-conf">' + (a.confidence || 0) + '% confidence</div>'
      + '<span class="agent-risk risk-' + risk + '">' + risk + ' RISK</span>'
      + '<div class="agent-detail">' + detail + '</div>'
      + '</div></div>';
  });
  grid.innerHTML = html;

  // Aggregated summary
  var aggRec = (d.recommendation || 'HOLD').toUpperCase();
  var aggRisk = (d.risk_level || 'MEDIUM').toUpperCase();
  document.getElementById('agentsAggregated').innerHTML =
    '<div class="agg-title">Aggregated Recommendation</div>'
    + '<div class="agg-rec ' + aggRec + '">' + aggRec + '</div>'
    + '<div class="agg-meta">'
    + '<span class="agg-chip purple">Confidence: ' + (d.confidence || 0) + '%</span>'
    + '<span class="agg-chip purple">Risk: ' + aggRisk + '</span>'
    + '<span class="agg-chip purple">Entry: ' + (d.entry_zone || '--') + '</span>'
    + '<span class="agg-chip purple">Stop: ' + (d.stop_loss || '--') + '</span>'
    + '<span class="agg-chip purple">Target: ' + (d.target || '--') + '</span>'
    + '</div>';
}

// Auto-analyze when AI signal updates (if checkbox checked)
var _origApplyAI = applyAI;
applyAI = function(d){
  _origApplyAI(d);
  var auto = document.getElementById('autoAnalyze');
  if(auto && auto.checked){
    setTimeout(runClaudeAnalysis, 500);
  }
};

// ── AI Model ──────────────────────────────────────────────────────────────
var currentModel = 'momentum';
var modelPresets = {
  momentum:  { rsi:14, macd:12, sl:3,  tp:6,  conf:70, ret:'+18.4%', wr:'64%', trades:142, dd:'-7.2%',  sharpe:'1.84' },
  mean:      { rsi:20, macd:10, sl:2,  tp:4,  conf:75, ret:'+12.1%', wr:'71%', trades:98,  dd:'-4.1%',  sharpe:'2.10' },
  breakout:  { rsi:10, macd:14, sl:5,  tp:15, conf:65, ret:'+31.7%', wr:'52%', trades:67,  dd:'-14.5%', sharpe:'1.42' },
  scalp:     { rsi:7,  macd:8,  sl:1,  tp:2,  conf:60, ret:'+8.2%',  wr:'58%', trades:420, dd:'-9.8%',  sharpe:'1.21' },
};

function selectModel(el, name){
  document.querySelectorAll('.model-option').forEach(function(o){ o.classList.remove('selected'); });
  el.classList.add('selected');
  currentModel = name;
}

function applyModel(){
  var preset = modelPresets[currentModel];
  if(!preset) return;
  document.getElementById('p-rsi').value   = preset.rsi;   document.getElementById('p-rsi-v').textContent   = preset.rsi;
  document.getElementById('p-macd').value  = preset.macd;  document.getElementById('p-macd-v').textContent  = preset.macd + '/26';
  document.getElementById('p-sl').value    = preset.sl;    document.getElementById('p-sl-v').textContent    = preset.sl + '%';
  document.getElementById('p-tp').value    = preset.tp;    document.getElementById('p-tp-v').textContent    = preset.tp + '%';
  document.getElementById('p-conf').value  = preset.conf;  document.getElementById('p-conf-v').textContent  = preset.conf + '%';
  document.getElementById('bt-return').textContent  = preset.ret;
  document.getElementById('bt-wr').textContent      = preset.wr;
  document.getElementById('bt-trades').textContent  = preset.trades;
  document.getElementById('bt-dd').textContent      = preset.dd;
  document.getElementById('bt-sharpe').textContent  = preset.sharpe;
  document.getElementById('bt-return').className    = 'ai-bt-val ' + (preset.ret.startsWith('+') ? 'pos' : 'neg');
}

// ── Fetch real candles from Binance via our Worker proxy
// Wrap any fetch with a timeout so a slow API never blocks the UI
function fetchWithTimeout(url, ms){
  ms = ms || 4000;
  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, ms);
  return fetch(url, { signal: ctrl.signal })
    .then(function(r){ clearTimeout(timer); return r; })
    .catch(function(e){ clearTimeout(timer); throw e; });
}

function fetchCandles(interval, limit){
  interval = interval || '15m';
  limit    = limit    || 60;
  return fetchWithTimeout('/api/candles?symbol=BTCUSDT&interval=' + interval + '&limit=' + limit)
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(!data || data.error || !data.length) return;
      S.candles = data;
      S.lastP   = data[data.length-1].c;
      S.prevP   = data[data.length-2].c;
      var hs = data.map(function(c){ return c.h; });
      var ls = data.map(function(c){ return c.l; });
      S.high24 = Math.max.apply(null,hs);
      S.low24  = Math.min.apply(null,ls);
    })
    .catch(function(e){ console.warn('candles fetch failed (using seed data):', e.message); });
}

// Fetch real ticker prices from Binance via our Worker proxy
function fetchTicker(){
  fetchWithTimeout('/api/ticker')
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(!data || data.error) return;
      var map = {BTCUSDT:'BTC',ETHUSDT:'ETH',SOLUSDT:'SOL',BNBUSDT:'BNB',
                 DOGEUSDT:'DOGE',ADAUSDT:'ADA',AVAXUSDT:'AVAX',
                 MATICUSDT:'MATIC',LINKUSDT:'LINK',LTCUSDT:'LTC'};
      var currentSymbolBase = currentTradingSymbol.replace('USDT', '');
      Object.keys(data).forEach(function(key){
        var sym = map[key]; if(!sym || !COINS[sym]) return;
        var d = data[key];
        COINS[sym].p = d.price;
        COINS[sym].b = COINS[sym].b || d.price; // keep original base for % calc
        // top bar
        var chg = d.change.toFixed(2);
        var ve = document.getElementById('tbv-'+sym);
        var ce = document.getElementById('tbc-'+sym);
        if(ve){ ve.textContent = '$' + d.price.toLocaleString(undefined,{minimumFractionDigits:COINS[sym].d,maximumFractionDigits:COINS[sym].d}); }
        if(ce){ ce.textContent = (d.change>=0?'+':'')+chg+'%'; ce.className='tb-chg '+(d.change>=0?'pos':'neg'); }
        // strip
        var pe = document.getElementById('sp-'+sym);
        var se = document.getElementById('sc-'+sym);
        if(pe){ pe.textContent = '$'+d.price.toFixed(COINS[sym].d); }
        if(se){ se.textContent = (d.change>=0?'+':'')+chg+'%'; se.className='strip-chg '+(d.change>=0?'pos':'neg'); }
        // update chart price in real-time for current trading symbol
        if(sym === currentSymbolBase){
          S.lastP = d.price;
          S.prevP = S.prevP || d.price;
          // Update center dashboard price display
          var priceEl = document.getElementById('ch-price');
          if(priceEl) priceEl.textContent = '$' + d.price.toLocaleString(undefined, {minimumFractionDigits:COINS[sym].d, maximumFractionDigits:COINS[sym].d});
          // Update price change display
          var changeEl = document.getElementById('ch-change');
          if(changeEl) {
            var changeDollar = (d.price - (COINS[sym].b || d.price)).toFixed(2);
            var changePercent = ((d.price - (COINS[sym].b || d.price))/(COINS[sym].b || d.price)*100).toFixed(2);
            changeEl.textContent = (changeDollar>=0?'+':'') + '$' + changeDollar + ' (' + (changePercent>=0?'+':'') + changePercent + '%)';
            changeEl.className = 'ch-change ' + (changePercent>=0 ? 'pos' : 'neg');
          }
        }
        // update 24h stats for BTC
        if(sym==='BTC'){
          S.high24 = d.high; S.low24 = d.low;
          var sh = document.getElementById('s-high');
          var sl = document.getElementById('s-low');
          var sv = document.getElementById('s-vol');
          if(sh) sh.textContent = '$'+d.high.toFixed(0);
          if(sl) sl.textContent = '$'+d.low.toFixed(0);
          if(sv) sv.textContent = (d.volume/1000).toFixed(1)+'K';
        }
      });
      // update spark history
      SPARK_SYMS.forEach(function(sym){
        sparkData[sym].shift();
        sparkData[sym].push(COINS[sym].p);
      });
      renderSparks();
    })
    .catch(function(e){ console.error('ticker error', e); });
}

// ── Real Balance from Binance ─────────────────────────────────────────────


// ── Drag-to-resize panels ─────────────────────────────────────────────────
(function(){
  var drag = null;

  function onDown(e){
    var t = e.target;
    // Column resizer
    if(t.classList.contains('col-resizer')){
      var prev = t.previousElementSibling;
      if(!prev) return;
      drag = { type:'col', el:t, startX:e.clientX, prevEl:prev, prevW:prev.offsetWidth };
      t.classList.add('rz-active');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }
    // Row resizer
    if(t.classList.contains('row-resizer')){
      var prevP = t.previousElementSibling;
      if(!prevP) return;
      drag = { type:'row', el:t, startY:e.clientY, prevEl:prevP, prevH:prevP.offsetHeight };
      t.classList.add('rz-active');
      document.body.style.cursor    = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }
  }

  function onMove(e){
    if(!drag) return;
    if(drag.type === 'col'){
      var dx   = e.clientX - drag.startX;
      var newW = Math.max(160, drag.prevW + dx);
      drag.prevEl.style.width    = newW + 'px';
      drag.prevEl.style.flex     = 'none';
      drag.prevEl.style.flexShrink = '0';
    } else {
      var dy   = e.clientY - drag.startY;
      var newH = Math.max(60, drag.prevH + dy);
      drag.prevEl.style.height   = newH + 'px';
      drag.prevEl.style.flex     = 'none';
      drag.prevEl.style.overflow = 'auto';
    }
  }

  function onUp(){
    if(!drag) return;
    drag.el.classList.remove('rz-active');
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
    drag = null;
  }

  // Attach to the dashboard grid only
  var grid = document.getElementById('grid');
  if(grid) grid.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove',  onMove);
  document.addEventListener('mouseup',    onUp);

  // Touch support
  function toMouse(e){ return {target:e.target, clientX:e.touches[0].clientX, clientY:e.touches[0].clientY, preventDefault:function(){e.preventDefault();}}; }
  if(grid) grid.addEventListener('touchstart', function(e){ onDown(toMouse(e)); }, {passive:false});
  document.addEventListener('touchmove',  function(e){ onMove(toMouse(e)); }, {passive:false});
  document.addEventListener('touchend',   onUp);
})();

function hideLoader(){
  var l = document.getElementById('loader');
  if(l){ l.style.opacity='0'; l.style.pointerEvents='none'; l.style.display='none'; }
}

function init(){
  try { buildSparkList(); } catch(e){ console.warn('buildSparkList',e); }
  try { setupPremiumMotion(); } catch(e){ console.warn('setupPremiumMotion',e); }

  // Load advanced settings from localStorage
  try{ loadAdvancedSettings(); } catch(e){ console.warn('loadAdvancedSettings',e); }

  // Hide loader immediately — never block on network
  hideLoader();

  // Fire all data fetches in parallel
  try{ fetchCandles('15m', 60); } catch(e){}
  try{ fetchAI(); }               catch(e){}
  try{ fetchTicker(); }           catch(e){}
  try{ fetchEvolutionStatus(); }  catch(e){}
  // Periodic refresh
  setInterval(function(){ try{ fetchTicker(); }catch(e){} },  5000);
  setInterval(function(){ try{ fetchCandles('15m',60); }catch(e){} }, 30000);
}

try{ init(); } catch(e){ console.error('init failed',e); hideLoader(); }
</script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',   // browser caches for 5 min
      }
    });
  },

  async scheduled(event, env, ctx) {
    console.log('pukitradev2 multi-agent tick:', new Date().toISOString());
    try {
      // Check kill switch
      const botEnabled = (await env.SETTINGS.get('botEnabled')) !== 'false';
      if (!botEnabled) {
        console.log('Bot is disabled via kill switch. Skipping.');
        return;
      }

      // Get trading symbol from KV
      const tradingSymbol = (await env.SETTINGS.get('tradingSymbol')) || 'BTCUSDT';
      const baseSymbol = tradingSymbol.replace('USDT', '');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`📊 AI Agent Analysis Tick - Trading Target: ${tradingSymbol} (${baseSymbol})`);
      console.log('═══════════════════════════════════════════════════════════');

      // Fetch from Binance for AI agent analysis
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + tradingSymbol);
      const tickerData = await tickerRes.json();
      let price = 43250, change = 0, volume = 30000, high = 44500, low = 42000;

      if(tickerData && tickerData.lastPrice) {
        price = parseFloat(tickerData.lastPrice);
        change = parseFloat(tickerData.priceChangePercent || 0);
        volume = parseFloat(tickerData.quoteAssetVolume || 30000);
        high = parseFloat(tickerData.highPrice || price);
        low = parseFloat(tickerData.lowPrice || price);
        console.log(`💹 ${baseSymbol} Price: $${price.toFixed(2)} | 24h Change: ${change.toFixed(2)}% | Volume: $${(volume/1e6).toFixed(2)}M`);
      }
      const p = new URLSearchParams({
        symbol: baseSymbol, price: price.toString(),
        change: change.toString(), signal: 'HOLD', confidence: '50',
        rsi: '50', macd: '0', volume: volume.toString(),
        high24: high.toString(), low24: low.toString(), bb_pos: '50'
      });
      const agentResults = await runAllAgents(p, env);
      const agg = aggregateResults(agentResults);

      // Store intelligence report in logs
      const report = {
        timestamp: new Date().toISOString(),
        symbol: baseSymbol,
        trading_target: tradingSymbol,
        ...agg,
        cached: false
      };
      intelligenceLogs.unshift(report);
      if (intelligenceLogs.length > MAX_LOGS) intelligenceLogs.pop();

      console.log(`📈 Multi-agent Consensus for ${baseSymbol}: ${agg.recommendation} @ ${agg.confidence}% | Risk: ${agg.risk_level}`);

      // ── INTELLIGENCE ANALYSIS ─────────────────────────────────────────
      // Get narrative explanation of the recommendation
      const intelligenceAgent = await callIntelligenceAgent(agg, env);
      if (intelligenceAgent?.raw) {
        console.log(`📊 Intelligence Brief: ${intelligenceAgent.raw.narrative}`);
        if (intelligenceAgent.raw.red_flags?.length > 0) {
          console.log(`⚠️  Red Flags: ${intelligenceAgent.raw.red_flags.join(', ')}`);
        }
        if (intelligenceAgent.raw.conflicts?.length > 0) {
          console.log(`🔗 Conflicts: ${intelligenceAgent.raw.conflicts.join(', ')}`);
        }
      }

      // ── CIO APPROVAL GATE ──────────────────────────────────────────────
      // Pass aggregated recommendation + intelligence to CIO for final approval
      const executionAgent = await callExecutionAgent(agg, intelligenceAgent, baseSymbol, price || '43250', env);
      if (!executionAgent) {
        addSystemLog('ERROR', 'Execution agent failed to respond', {});
        return;
      }

      console.log('👨‍💼 CIO Decision:', {
        decision: executionAgent.recommendation,
        reasoning: executionAgent.raw?.reasoning
      });

      // Daily stop-loss reset
      const today = new Date().toDateString();
      if (tradingState.dailyResetDate !== today) {
        tradingState.dailyLoss = 0;
        tradingState.dailyResetDate = today;
        console.log('✓ Daily stop-loss reset for new day');
      }

      // CIO approval check
      const execRaw = executionAgent.raw || {};
      const shouldExecute = executionAgent.recommendation === 'EXECUTE' && tradingState.dailyLoss < 10;

      if (!shouldExecute) {
        const reason =
          executionAgent.recommendation !== 'EXECUTE' ? `CIO decision: ${executionAgent.recommendation} (${execRaw.reasoning})` :
          tradingState.dailyLoss >= 10 ? 'Daily loss limit reached' :
          'Unknown reason';
        addSystemLog('WARN', `Trade rejected: ${reason}`, { cioDecision: executionAgent.recommendation });
        return;
      }

      console.log('🎯 Trading conditions met! Executing trade...');

      // Get current balance
      const balanceResp = await getBalance(env);
      if (!balanceResp.success || !balanceResp.usdtBalance) {
        addSystemLog('ERROR', 'Failed to get balance', { error: balanceResp.error });
        return;
      }

      const currentBalance = parseFloat(balanceResp.usdtBalance);
      addSystemLog('INFO', `Balance checked: $${currentBalance.toFixed(2)}`, { usd: balanceResp.totalUSD, myr: balanceResp.totalMYR });

      // Use execution agent's position size recommendation or fall back to 25% of balance
      let positionSize = currentBalance * 0.25; // Conservative 25%
      if (execRaw.position_size) {
        const sizeStr = execRaw.position_size.toLowerCase();
        if (sizeStr.includes('%')) {
          const pct = parseFloat(sizeStr) / 100;
          positionSize = currentBalance * pct;
        } else if (!isNaN(parseFloat(execRaw.position_size))) {
          positionSize = parseFloat(execRaw.position_size);
        }
      }

      // Minimum trade size check
      if (positionSize < 10) {
        addSystemLog('WARN', `Position size too small ($${positionSize.toFixed(2)}), minimum is $10`, {});
        return;
      }

      // Use aggregated recommendation for the trade action
      const action = agg.recommendation.toUpperCase();
      const side = (action === 'BUY') ? 'buy' : 'sell';

      // Parse entry price from aggregation
      let entryPrice = null;
      if (agg.entry_zone && agg.entry_zone !== 'N/A') {
        const priceStr = agg.entry_zone.toString().replace(/[$,]/g, '');
        if (priceStr.includes('-')) {
          const [low, high] = priceStr.split('-').map(Number);
          entryPrice = ((low + high) / 2).toFixed(2);
        } else {
          entryPrice = (parseFloat(priceStr)).toFixed(2);
        }
      }

      // Calculate base asset size (BTC) for stop-loss/take-profit orders
      const currentPrice = price || 43250;
      const btcSize = (positionSize / currentPrice).toFixed(8);

      console.log(`💰 Current balance: $${currentBalance.toFixed(2)}`);
      console.log(`📍 Position size: $${positionSize.toFixed(2)} (${(positionSize/currentBalance*100).toFixed(1)}%)`);
      console.log(`🎬 Action: ${action} | Entry: ${entryPrice || 'MARKET'} | Stop: ${agg.stop_loss || 'N/A'} | Target: ${agg.target || 'N/A'}`);

      // ── Place entry order (use limit at entry zone, or market order if no entry price specified) ──
      let entryResp;
      if (entryPrice) {
        console.log(`📤 Placing LIMIT ${side.toUpperCase()} order at $${entryPrice}...`);
        entryResp = await placeLimitOrder(env, side, positionSize, entryPrice);
      } else {
        console.log(`📤 Placing MARKET ${side.toUpperCase()} order for ${tradingSymbol}...`);
        entryResp = await placeOrder(env, side, positionSize);
      }

      if (!entryResp.success) {
        addSystemLog('ERROR', `Entry order failed for ${baseSymbol}`, { error: entryResp.error });
        return;
      }

      addSystemLog('SUCCESS', `Entry order filled: ${side.toUpperCase()} ${baseSymbol}`, { orderId: entryResp.orderId, type: entryResp.orderType || 'market', price: entryPrice, amount: positionSize });

      // ── Place stop-loss and take-profit after successful entry ──
      if (agg.stop_loss && agg.stop_loss !== 'N/A') {
        const stopPrice = parseFloat(agg.stop_loss.toString().replace(/[$,]/g, '')).toFixed(2);
        const slSide = side === 'buy' ? 'sell' : 'buy'; // opposite side for SL
        console.log(`🛡️ Placing STOP-LOSS ${slSide.toUpperCase()} at $${stopPrice}...`);
        const slResp = await placeStopLossOrder(env, slSide, btcSize, stopPrice);
        if (slResp.success) {
          addSystemLog('INFO', `Stop-loss placed: ${slSide.toUpperCase()} $${stopPrice}`, { orderId: slResp.orderId });
        } else {
          console.error('Stop-loss order failed:', slResp.error);
        }
      }

      if (agg.target && agg.target !== 'N/A') {
        const tpPrice = parseFloat(agg.target.toString().replace(/[$,]/g, '')).toFixed(2);
        const tpSide = side === 'buy' ? 'sell' : 'buy'; // opposite side for TP
        console.log(`🎯 Placing TAKE-PROFIT ${tpSide.toUpperCase()} at $${tpPrice}...`);
        const tpResp = await placeTakeProfitOrder(env, tpSide, btcSize, tpPrice);
        if (tpResp.success) {
          addSystemLog('INFO', `Take-profit placed: ${tpSide.toUpperCase()} $${tpPrice}`, { orderId: tpResp.orderId });
        } else {
          console.error('Take-profit order failed:', tpResp.error);
        }
      }

      // Log the completed trade with full explainability
      const trade = {
        timestamp: new Date().toISOString(),
        orderId: entryResp.orderId,
        symbol: baseSymbol,
        trading_target: tradingSymbol,
        side: side,
        orderType: entryResp.orderType || 'market',
        amount: positionSize.toFixed(2),
        btcSize: btcSize,
        confidence: agg.confidence,
        action: action,
        risk_level: agg.risk_level,
        entry_price: entryPrice || agg.entry_zone,
        stop_loss: agg.stop_loss,
        take_profit: agg.target,

        // Explainability layer
        agent_analysis: {
          technical: { recommendation: agg.agents?.technical?.recommendation, confidence: agg.agents?.technical?.confidence },
          sentiment: { recommendation: agg.agents?.sentiment?.recommendation, confidence: agg.agents?.sentiment?.confidence },
          fundamental: { recommendation: agg.agents?.fundamental?.recommendation, confidence: agg.agents?.fundamental?.confidence },
          risk: { recommendation: agg.agents?.risk?.recommendation, confidence: agg.agents?.risk?.confidence },
          portfolio: { recommendation: agg.agents?.portfolio?.recommendation, confidence: agg.agents?.portfolio?.confidence }
        },
        intelligence_brief: {
          narrative: intelligenceAgent?.raw?.narrative,
          consensus_quality: intelligenceAgent?.raw?.consensus_quality,
          key_insight: intelligenceAgent?.raw?.key_insight,
          red_flags: intelligenceAgent?.raw?.red_flags || [],
          conflicts: intelligenceAgent?.raw?.conflicts || []
        },
        cio_decision: executionAgent.recommendation,
        cio_reasoning: execRaw.reasoning,
        status: 'submitted'
      };
      tradingState.tradesLog.unshift(trade);
      tradingState.lastTradeTime = new Date().toISOString();
      addSystemLog('SUCCESS', `Trade executed: ${side.toUpperCase()} ${baseSymbol}`, { orderId: entryResp.orderId, amount: positionSize, confidence: agg.confidence, cioDecision: executionAgent.recommendation });
    } catch(e) {
      console.error('Cron tick failed:', e.message);
    }
  }
};
