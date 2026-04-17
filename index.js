// AI Trading Bot — Cloudflare Workers

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── /api/prediction ────────────────────────────────────────────────
    if (url.pathname === '/api/prediction') {
      const r   = Math.random();
      const sig = r < 0.40 ? 'BUY' : r < 0.75 ? 'SELL' : 'HOLD';
      const price      = 43250 + (Math.random() * 2400 - 1200);
      const confidence = Math.floor(Math.random() * 28) + 63;
      const rsi        = Math.floor(Math.random() * 45) + 28;
      const macd       = (Math.random() * 2.4 - 1.2).toFixed(3);
      const ema20      = (price * (1 + (Math.random() * .01 - .005))).toFixed(2);
      const volume     = Math.floor(Math.random() * 60000 + 8000);
      const bb_pos     = Math.floor(Math.random() * 100);
      return new Response(
        JSON.stringify({ sig, price, confidence, rsi, macd, ema20, volume, bb_pos, ts: new Date().toISOString() }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // ── HTML ──────────────────────────────────────────────────────────
    const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NOVA TRADE · AI Dashboard</title>
<style>
/* ═══════════════════════════════════════════════
   TOKENS
═══════════════════════════════════════════════ */
:root{
  --bg:        #080810;
  --surf:      #0e0e1c;
  --card:      #12121f;
  --card2:     #16162a;
  --bdr:       #22224a;
  --bdr2:      #2e2e60;
  --txt:       #d4d8f0;
  --muted:     #4a4a80;
  --gold:      #f0a500;
  --gold2:     #ffd460;
  --gold-glow: #f0a50033;
  --cyan:      #00d4ff;
  --cyan-glow: #00d4ff22;
  --green:     #00e676;
  --green-dim: #00e67622;
  --red:       #ff2d55;
  --red-dim:   #ff2d5522;
  --yellow:    #ffd600;
  --radius:    14px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:13px;scroll-behavior:smooth}
body{
  background:var(--bg);color:var(--txt);
  font-family:'Segoe UI',system-ui,sans-serif;
  min-height:100vh;overflow-x:hidden;
}

/* ─── animated bg grid ─── */
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:
    linear-gradient(var(--bdr) 1px,transparent 1px),
    linear-gradient(90deg,var(--bdr) 1px,transparent 1px);
  background-size:60px 60px;
  opacity:.18;
  mask-image:radial-gradient(ellipse 80% 80% at 50% 0%,black 40%,transparent 100%);
}

/* ─── scrollbar ─── */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--surf)}
::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:4px}

/* ═══════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════ */
#app{
  position:relative;z-index:1;
  display:grid;
  grid-template-rows:56px 44px 1fr 180px;
  min-height:100vh;
}

/* ═══════════════════════════════════════════════
   TOPBAR
═══════════════════════════════════════════════ */
#topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 1.5rem;
  background:linear-gradient(180deg,#14143000,#0e0e1c);
  border-bottom:1px solid var(--bdr);
  backdrop-filter:blur(12px);
}
.logo-wrap{display:flex;align-items:center;gap:.6rem}
.logo-hex{
  width:28px;height:28px;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  display:flex;align-items:center;justify-content:center;
  font-size:.65rem;font-weight:900;color:#000;
}
.logo-text{font-size:1rem;font-weight:800;letter-spacing:.12em;color:#fff}
.logo-text span{color:var(--gold)}

.tb-center{display:flex;align-items:center;gap:1.5rem}
.tb-pair{
  display:flex;flex-direction:column;align-items:center;
  cursor:pointer;padding:.2rem .6rem;border-radius:8px;transition:background .2s;
}
.tb-pair:hover,.tb-pair.active{background:var(--card2)}
.tb-pair.active .tb-sym{color:var(--gold)}
.tb-sym{font-size:.65rem;color:var(--muted);font-weight:700;letter-spacing:.1em}
.tb-val{font-size:.85rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.tb-chg{font-size:.6rem;font-weight:600}
.pos{color:var(--green)}.neg{color:var(--red)}

.tb-right{display:flex;align-items:center;gap:.8rem}
.status-dot{
  width:8px;height:8px;border-radius:50%;background:var(--green);
  box-shadow:0 0 8px var(--green);animation:blink 2s infinite;
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
#clock{font-size:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.icon-btn{
  width:30px;height:30px;border-radius:8px;border:1px solid var(--bdr);
  background:var(--card);color:var(--muted);cursor:pointer;
  display:flex;align-items:center;justify-content:center;font-size:.85rem;
  transition:all .2s;
}
.icon-btn:hover{border-color:var(--gold);color:var(--gold)}

/* ═══════════════════════════════════════════════
   MARKET STRIP
═══════════════════════════════════════════════ */
#strip{
  display:flex;align-items:center;gap:0;
  border-bottom:1px solid var(--bdr);
  background:var(--surf);overflow-x:auto;
  scrollbar-width:none;
}
#strip::-webkit-scrollbar{display:none}
.strip-item{
  display:flex;align-items:center;gap:.6rem;
  padding:.25rem 1.2rem;white-space:nowrap;
  border-right:1px solid var(--bdr);
  min-width:fit-content;
}
.strip-sym{font-size:.65rem;color:var(--muted);font-weight:700;letter-spacing:.1em}
.strip-price{font-size:.8rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.strip-chg{font-size:.65rem;font-weight:600}

/* ═══════════════════════════════════════════════
   MAIN GRID  (3 columns)
═══════════════════════════════════════════════ */
#grid{
  display:grid;
  grid-template-columns:260px 1fr 300px;
  gap:1px;
  background:var(--bdr);
  overflow:hidden;
}
.col{
  background:var(--bg);
  display:flex;flex-direction:column;
  gap:0;overflow:hidden;
}
.panel{
  padding:1rem;
  border-bottom:1px solid var(--bdr);
  flex-shrink:0;
}
.panel:last-child{border-bottom:none;flex:1}

/* ─── panel header ─── */
.ph{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:.75rem;
}
.ph-title{
  font-size:.6rem;font-weight:800;letter-spacing:.15em;
  text-transform:uppercase;color:var(--muted);
  display:flex;align-items:center;gap:.4rem;
}
.ph-title::before{
  content:'';width:3px;height:10px;border-radius:2px;
  background:var(--gold);box-shadow:0 0 6px var(--gold);
}
.ph-badge{
  font-size:.6rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;
  background:var(--card2);color:var(--muted);letter-spacing:.06em;
}

/* ═══════════════════════════════════════════════
   LEFT COL — portfolio
═══════════════════════════════════════════════ */
.acct-hero{
  background:linear-gradient(135deg,#1a140a,#211a08);
  border:1px solid #3a2e0a;border-radius:10px;padding:.9rem;
  margin-bottom:.75rem;
}
.acct-label{font-size:.6rem;color:#a07830;text-transform:uppercase;letter-spacing:.12em}
.acct-val{font-size:1.9rem;font-weight:800;color:var(--gold2);font-variant-numeric:tabular-nums;line-height:1.1}
.acct-sub{font-size:.7rem;color:var(--muted);margin-top:.2rem}

.kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.kpi{
  background:var(--card2);border:1px solid var(--bdr);border-radius:8px;
  padding:.5rem .6rem;
}
.kpi-l{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.kpi-v{font-size:.95rem;font-weight:700;color:#fff;margin-top:.15rem;font-variant-numeric:tabular-nums}
.kpi-v.g{color:var(--green)}.kpi-v.r{color:var(--red)}.kpi-v.gold{color:var(--gold)}

/* ─── order flow bar ─── */
.flow-wrap{margin-top:.5rem}
.flow-label{display:flex;justify-content:space-between;font-size:.65rem;margin-bottom:.3rem}
.flow-track{height:8px;border-radius:4px;background:var(--bdr);overflow:hidden;display:flex}
.flow-buy{height:100%;background:linear-gradient(90deg,var(--green),#00c85a);transition:width .5s}
.flow-sell{height:100%;background:linear-gradient(90deg,#c81040,var(--red));transition:width .5s}

/* ─── mini sparklines ─── */
.spark-row{display:flex;flex-direction:column;gap:.35rem}
.spark-item{
  display:flex;align-items:center;gap:.5rem;
  background:var(--card2);border-radius:7px;padding:.4rem .6rem;
  border:1px solid var(--bdr);
}
.spark-sym{font-size:.65rem;font-weight:700;color:var(--muted);min-width:36px}
.spark-price{font-size:.75rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;flex:1;text-align:right}
.spark-canvas{width:60px;height:22px}

/* ═══════════════════════════════════════════════
   CENTER COL — chart
═══════════════════════════════════════════════ */
.chart-header{
  display:flex;align-items:center;gap:1rem;
  padding:.75rem 1rem .5rem;
  border-bottom:1px solid var(--bdr);
  background:var(--surf);
}
.ch-price{font-size:2.4rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;line-height:1}
.ch-change{font-size:.9rem;font-weight:600}
.ch-label{font-size:.7rem;color:var(--muted);margin-left:auto;text-align:right}
.ch-label strong{display:block;color:#fff;font-size:.8rem}

.tf-row{
  display:flex;align-items:center;gap:.3rem;
  padding:.5rem 1rem;border-bottom:1px solid var(--bdr);
  background:var(--surf);
}
.tf{
  font-size:.65rem;font-weight:700;letter-spacing:.08em;
  padding:.2rem .55rem;border-radius:5px;cursor:pointer;
  background:transparent;color:var(--muted);border:1px solid transparent;
  transition:all .15s;
}
.tf.on{background:var(--gold);color:#000;border-color:var(--gold)}
.tf:hover:not(.on){color:var(--gold);border-color:var(--bdr2)}
.chart-sep{width:1px;background:var(--bdr);margin:0 .2rem;height:16px}

.chart-body{flex:1;position:relative;overflow:hidden}
#mainChart{position:absolute;inset:0;width:100%;height:100%}

/* ═══════════════════════════════════════════════
   RIGHT COL — AI signal
═══════════════════════════════════════════════ */

/* ─── hero signal ─── */
.sig-hero{
  position:relative;overflow:hidden;
  border-radius:12px;padding:1rem;
  margin-bottom:.75rem;
  transition:background .4s,border-color .4s;
}
.sig-hero.BUY{background:radial-gradient(circle at 30% 50%,#003820,#001a0e);border:1px solid #00e676}
.sig-hero.SELL{background:radial-gradient(circle at 30% 50%,#380015,#1a0008);border:1px solid #ff2d55}
.sig-hero.HOLD{background:radial-gradient(circle at 30% 50%,#3a2e00,#1a1500);border:1px solid #ffd600}

/* pulse rings */
.ring-wrap{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:80px;height:80px}
.ring{
  position:absolute;border-radius:50%;border:1.5px solid;
  animation:expand 2.4s ease-out infinite;
  top:50%;left:50%;transform:translate(-50%,-50%);
  width:100%;height:100%;
}
.ring:nth-child(2){animation-delay:.8s}
.ring:nth-child(3){animation-delay:1.6s}
.BUY  .ring{border-color:var(--green)}
.SELL .ring{border-color:var(--red)}
.HOLD .ring{border-color:var(--yellow)}
@keyframes expand{
  0%{transform:translate(-50%,-50%) scale(.3);opacity:.8}
  100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}
}

.sig-label{font-size:.6rem;color:rgba(255,255,255,.4);font-weight:700;letter-spacing:.2em;text-transform:uppercase}
.sig-word{font-size:2.6rem;font-weight:900;letter-spacing:.04em;line-height:1.05;margin:.1rem 0}
.BUY  .sig-word{color:var(--green);text-shadow:0 0 20px var(--green)}
.SELL .sig-word{color:var(--red);text-shadow:0 0 20px var(--red)}
.HOLD .sig-word{color:var(--yellow);text-shadow:0 0 20px var(--yellow)}
.sig-price{font-size:.8rem;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums}

/* ─── confidence arc ─── */
.gauge-wrap{display:flex;flex-direction:column;align-items:center;margin:.25rem 0}
.gauge-svg{width:110px;height:66px;overflow:visible}
.gauge-bg{fill:none;stroke:var(--bdr2);stroke-width:8;stroke-linecap:round}
.gauge-fill{
  fill:none;stroke-width:8;stroke-linecap:round;
  transition:stroke-dashoffset .7s ease,stroke .4s;
}
.gauge-pct{font-size:.65rem;fill:var(--muted);font-family:system-ui;text-anchor:middle}
.gauge-num{font-size:1.3rem;font-weight:800;font-family:system-ui;text-anchor:middle}
.gauge-label{font-size:.55rem;fill:var(--muted);font-family:system-ui;text-anchor:middle;letter-spacing:.1em;text-transform:uppercase}

/* ─── indicator chips ─── */
.chips{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.35rem}
.chip{
  background:var(--card2);border:1px solid var(--bdr);border-radius:8px;
  padding:.45rem .5rem;text-align:center;
}
.chip-k{font-size:.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.chip-v{font-size:.85rem;font-weight:700;color:#fff;margin-top:.15rem;font-variant-numeric:tabular-nums}

/* ─── action buttons ─── */
.action-wrap{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.abtn{
  font-size:.85rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  border:none;border-radius:10px;padding:.7rem;cursor:pointer;
  transition:transform .1s,box-shadow .2s;position:relative;overflow:hidden;
}
.abtn::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(255,255,255,.15),transparent);
  pointer-events:none;
}
.abtn-buy{background:linear-gradient(135deg,#00c853,#00e676);color:#000}
.abtn-sell{background:linear-gradient(135deg,#c62828,#ff2d55);color:#fff}
.abtn:hover{transform:translateY(-2px)}
.abtn-buy:hover{box-shadow:0 6px 20px #00e67644}
.abtn-sell:hover{box-shadow:0 6px 20px #ff2d5544}
.abtn:active{transform:translateY(0)}

/* ─── signal log right ─── */
.log-wrap{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.3rem}
.le{
  display:flex;align-items:center;gap:.5rem;
  padding:.4rem .6rem;border-radius:7px;border:1px solid var(--bdr);
  background:var(--card2);font-size:.72rem;
}
.le-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.le.BUY  .le-dot{background:var(--green);box-shadow:0 0 5px var(--green)}
.le.SELL .le-dot{background:var(--red);box-shadow:0 0 5px var(--red)}
.le.HOLD .le-dot{background:var(--yellow)}
.le-sig{font-weight:800;min-width:30px}
.le.BUY  .le-sig{color:var(--green)}
.le.SELL .le-sig{color:var(--red)}
.le.HOLD .le-sig{color:var(--yellow)}
.le-conf{color:var(--muted);font-size:.65rem}
.le-price{flex:1;text-align:right;color:#fff;font-variant-numeric:tabular-nums}
.le-time{color:var(--muted);font-size:.62rem;min-width:38px;text-align:right}

/* ═══════════════════════════════════════════════
   BOTTOM BAR
═══════════════════════════════════════════════ */
#bottom{
  display:grid;grid-template-columns:1fr 1fr 1fr;
  background:var(--surf);border-top:1px solid var(--bdr);
}
.bot-col{padding:.75rem 1rem;border-right:1px solid var(--bdr)}
.bot-col:last-child{border-right:none}
.bot-title{
  font-size:.58rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin-bottom:.5rem;
}
.bot-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:.25rem 0;border-bottom:1px solid var(--bdr);
  font-size:.7rem;
}
.bot-row:last-child{border-bottom:none}
.bot-row .sym{color:var(--muted);font-size:.65rem}
.bot-row .val{font-variant-numeric:tabular-nums;font-weight:600}

/* ═══════════════════════════════════════════════
   LOADER OVERLAY
═══════════════════════════════════════════════ */
#loader{
  position:fixed;inset:0;background:var(--bg);z-index:999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;
  transition:opacity .5s;
}
#loader.hide{opacity:0;pointer-events:none}
.loader-hex{
  width:50px;height:50px;
  clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  animation:spin 1.5s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
.loader-text{font-size:.7rem;letter-spacing:.3em;color:var(--muted);text-transform:uppercase}

/* ═══════════════════════════════════════════════
   RESPONSIVE
═══════════════════════════════════════════════ */
@media(max-width:1000px){
  #grid{grid-template-columns:1fr 1fr}
  #grid .col:first-child{display:none}
}
@media(max-width:660px){
  #grid{grid-template-columns:1fr}
  #grid .col:nth-child(2){order:1}
  #grid .col:last-child{order:2}
  #bottom{grid-template-columns:1fr}
  .bot-col{border-right:none;border-bottom:1px solid var(--bdr)}
}
</style>
</head>
<body>

<!-- ── Loader ── -->
<div id="loader">
  <div class="loader-hex"></div>
  <div class="loader-text">Loading NOVA TRADE</div>
</div>

<div id="app">

<!-- ══════════════════════════════════════════
  TOP BAR
══════════════════════════════════════════ -->
<div id="topbar">
  <div class="logo-wrap">
    <div class="logo-hex">N</div>
    <div class="logo-text">NOVA <span>TRADE</span></div>
  </div>
  <div class="tb-center">
    <div class="tb-pair active" data-sym="BTC">
      <span class="tb-sym">BTC/USDT</span>
      <span class="tb-val" id="tbv-BTC">$43,250</span>
      <span class="tb-chg pos" id="tbc-BTC">+0.00%</span>
    </div>
    <div class="tb-pair" data-sym="ETH">
      <span class="tb-sym">ETH/USDT</span>
      <span class="tb-val" id="tbv-ETH">$2,280</span>
      <span class="tb-chg pos" id="tbc-ETH">+0.00%</span>
    </div>
    <div class="tb-pair" data-sym="SOL">
      <span class="tb-sym">SOL/USDT</span>
      <span class="tb-val" id="tbv-SOL">$98.40</span>
      <span class="tb-chg neg" id="tbc-SOL">-0.00%</span>
    </div>
    <div class="tb-pair" data-sym="BNB">
      <span class="tb-sym">BNB/USDT</span>
      <span class="tb-val" id="tbv-BNB">$385</span>
      <span class="tb-chg pos" id="tbc-BNB">+0.00%</span>
    </div>
  </div>
  <div class="tb-right">
    <div class="status-dot"></div>
    <span id="clock">--:--:--</span>
    <button class="icon-btn" title="Refresh" onclick="refresh()">⟳</button>
  </div>
</div>

<!-- ══════════════════════════════════════════
  MARKET STRIP
══════════════════════════════════════════ -->
<div id="strip">
  <div class="strip-item"><span class="strip-sym">DOGE</span><span class="strip-price" id="sp-DOGE">$0.1280</span><span class="strip-chg pos" id="sc-DOGE">+1.2%</span></div>
  <div class="strip-item"><span class="strip-sym">ADA</span><span class="strip-price" id="sp-ADA">$0.4510</span><span class="strip-chg neg" id="sc-ADA">-0.8%</span></div>
  <div class="strip-item"><span class="strip-sym">AVAX</span><span class="strip-price" id="sp-AVAX">$36.20</span><span class="strip-chg pos" id="sc-AVAX">+2.1%</span></div>
  <div class="strip-item"><span class="strip-sym">MATIC</span><span class="strip-price" id="sp-MATIC">$0.8840</span><span class="strip-chg neg" id="sc-MATIC">-1.4%</span></div>
  <div class="strip-item"><span class="strip-sym">LINK</span><span class="strip-price" id="sp-LINK">$14.60</span><span class="strip-chg pos" id="sc-LINK">+0.9%</span></div>
  <div class="strip-item"><span class="strip-sym">DOT</span><span class="strip-price" id="sp-DOT">$7.82</span><span class="strip-chg neg" id="sc-DOT">-0.5%</span></div>
  <div class="strip-item"><span class="strip-sym">UNI</span><span class="strip-price" id="sp-UNI">$9.15</span><span class="strip-chg pos" id="sc-UNI">+3.2%</span></div>
  <div class="strip-item"><span class="strip-sym">LTC</span><span class="strip-price" id="sp-LTC">$82.40</span><span class="strip-chg pos" id="sc-LTC">+0.4%</span></div>
  <div class="strip-item"><span class="strip-sym">ATOM</span><span class="strip-price" id="sp-ATOM">$10.22</span><span class="strip-chg neg" id="sc-ATOM">-1.1%</span></div>
  <div class="strip-item"><span class="strip-sym">FTM</span><span class="strip-price" id="sp-FTM">$0.4820</span><span class="strip-chg pos" id="sc-FTM">+4.5%</span></div>
</div>

<!-- ══════════════════════════════════════════
  3-COLUMN GRID
══════════════════════════════════════════ -->
<div id="grid">

  <!-- ── LEFT: Portfolio ── -->
  <div class="col" style="overflow-y:auto">
    <div class="panel">
      <div class="ph">
        <div class="ph-title">Portfolio</div>
        <div class="ph-badge" id="countdown">15s</div>
      </div>
      <div class="acct-hero">
        <div class="acct-label">Total Balance</div>
        <div class="acct-val" id="pf-bal">$10,000.00</div>
        <div class="acct-sub">P&amp;L today: <span id="pf-pnl" class="g">+$0.00</span></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-l">Positions</div><div class="kpi-v" id="pf-pos">0</div></div>
        <div class="kpi"><div class="kpi-l">Win Rate</div><div class="kpi-v gold" id="pf-wr">--%</div></div>
        <div class="kpi"><div class="kpi-l">Total Trades</div><div class="kpi-v" id="pf-tot">0</div></div>
        <div class="kpi"><div class="kpi-l">Best Trade</div><div class="kpi-v g" id="pf-best">--</div></div>
      </div>
      <div class="flow-wrap">
        <div class="flow-label">
          <span class="pos">Buy Pressure</span>
          <span id="flow-pct" class="pos">50%</span>
          <span class="neg">Sell Pressure</span>
        </div>
        <div class="flow-track">
          <div class="flow-buy" id="flow-buy" style="width:50%"></div>
          <div class="flow-sell" id="flow-sell" style="width:50%"></div>
        </div>
      </div>
    </div>

    <div class="panel" style="flex:1;overflow-y:auto">
      <div class="ph"><div class="ph-title">Watchlist</div></div>
      <div class="spark-row" id="sparkList">
        <!-- filled by JS -->
      </div>
    </div>
  </div>

  <!-- ── CENTER: Chart ── -->
  <div class="col">
    <div class="chart-header">
      <div>
        <div id="ch-price" class="ch-price">$43,250</div>
        <div id="ch-change" class="ch-change pos">+$0.00 (+0.00%)</div>
      </div>
      <div class="ch-label">
        <strong>BTC / USDT</strong>
        Binance · 15m
      </div>
    </div>
    <div class="tf-row">
      <button class="tf on" data-tf="1m">1m</button>
      <button class="tf" data-tf="5m">5m</button>
      <button class="tf" data-tf="15m">15m</button>
      <button class="tf" data-tf="1h">1h</button>
      <button class="tf" data-tf="4h">4h</button>
      <div class="chart-sep"></div>
      <button class="tf" data-tf="Line">Line</button>
      <button class="tf on" data-tf="Candle">Candle</button>
    </div>
    <div class="chart-body">
      <canvas id="mainChart"></canvas>
    </div>
  </div>

  <!-- ── RIGHT: AI Signal ── -->
  <div class="col" style="overflow-y:auto">
    <div class="panel">
      <div class="ph"><div class="ph-title">AI Signal</div><div class="ph-badge" id="ai-ts">--:--</div></div>

      <!-- Hero Signal -->
      <div class="sig-hero HOLD" id="sigHero">
        <div class="ring-wrap"><div class="ring"></div><div class="ring"></div><div class="ring"></div></div>
        <div class="sig-label">Recommendation</div>
        <div class="sig-word" id="sigWord">ANALYZING</div>
        <div class="sig-price" id="sigPrice">@ $--,---</div>
      </div>

      <!-- Confidence Gauge -->
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 120 70">
          <!-- half-circle track: r=44, center 60,60 -->
          <path class="gauge-bg"
            d="M 16 60 A 44 44 0 0 1 104 60"
            stroke-dasharray="138 138" stroke-dashoffset="0"/>
          <path class="gauge-fill" id="gaugeFill"
            d="M 16 60 A 44 44 0 0 1 104 60"
            stroke-dasharray="138 138" stroke-dashoffset="138"
            stroke="var(--gold)"/>
          <text class="gauge-num" id="gaugeNum" x="60" y="56" fill="var(--gold)">--%</text>
          <text class="gauge-label" x="60" y="68">Confidence</text>
        </svg>
      </div>

      <!-- Indicator chips -->
      <div class="chips">
        <div class="chip"><div class="chip-k">RSI</div><div class="chip-v" id="c-rsi">--</div></div>
        <div class="chip"><div class="chip-k">MACD</div><div class="chip-v" id="c-macd">--</div></div>
        <div class="chip"><div class="chip-k">BB%</div><div class="chip-v" id="c-bb">--</div></div>
        <div class="chip"><div class="chip-k">EMA20</div><div class="chip-v" id="c-ema">--</div></div>
        <div class="chip"><div class="chip-k">Vol</div><div class="chip-v" id="c-vol">--</div></div>
        <div class="chip"><div class="chip-k">Trend</div><div class="chip-v" id="c-trend">--</div></div>
      </div>
    </div>

    <!-- Quick Trade -->
    <div class="panel">
      <div class="ph"><div class="ph-title">Quick Trade</div></div>
      <div class="action-wrap">
        <button class="abtn abtn-buy" onclick="placeOrder('BUY')">▲ BUY</button>
        <button class="abtn abtn-sell" onclick="placeOrder('SELL')">▼ SELL</button>
      </div>
    </div>

    <!-- Signal Log -->
    <div class="panel" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
      <div class="ph"><div class="ph-title">Signal History</div></div>
      <div class="log-wrap" id="logWrap">
        <div style="color:var(--muted);font-size:.7rem;text-align:center;padding:.5rem">Awaiting signals…</div>
      </div>
    </div>
  </div>

</div><!-- /grid -->

<!-- ══════════════════════════════════════════
  BOTTOM BAR
══════════════════════════════════════════ -->
<div id="bottom">
  <div class="bot-col">
    <div class="bot-title">Recent Trades</div>
    <div id="recentTrades">
      <div class="bot-row"><span class="sym">—</span><span>No trades yet</span></div>
    </div>
  </div>
  <div class="bot-col">
    <div class="bot-title">Market Stats · BTC</div>
    <div class="bot-row"><span class="sym">24h High</span><span class="val pos" id="s-high">$44,500</span></div>
    <div class="bot-row"><span class="sym">24h Low</span><span class="val neg" id="s-low">$42,100</span></div>
    <div class="bot-row"><span class="sym">Volume</span><span class="val" id="s-vol">—</span></div>
    <div class="bot-row"><span class="sym">Market Cap</span><span class="val">$848B</span></div>
  </div>
  <div class="bot-col">
    <div class="bot-title">Session Summary</div>
    <div class="bot-row"><span class="sym">Total Signals</span><span class="val" id="ss-total">0</span></div>
    <div class="bot-row"><span class="sym">Buy Signals</span><span class="val pos" id="ss-buy">0</span></div>
    <div class="bot-row"><span class="sym">Sell Signals</span><span class="val neg" id="ss-sell">0</span></div>
    <div class="bot-row"><span class="sym">Hold Signals</span><span class="val" id="ss-hold">0</span></div>
  </div>
</div>

</div><!-- /app -->

<script>
/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const S = {
  candles:[],lastP:43250,prevP:43250,
  high24:44500,low24:42000,
  bal:10000,pnl:0,pos:0,wins:0,tots:0,best:0,
  cd:15,logs:[],
  buySig:0,sellSig:0,holdSig:0,
  trades:[],
  flow:50,
};
const COINS = {
  BTC:{p:43250,b:43250,d:2},ETH:{p:2280,b:2280,d:2},
  SOL:{p:98.4,b:98.4,d:2},BNB:{p:385,b:385,d:2},
  DOGE:{p:0.128,b:0.128,d:4},ADA:{p:0.451,b:0.451,d:4},
  AVAX:{p:36.2,b:36.2,d:2},MATIC:{p:0.884,b:0.884,d:4},
  LINK:{p:14.6,b:14.6,d:2},DOT:{p:7.82,b:7.82,d:2},
  UNI:{p:9.15,b:9.15,d:2},LTC:{p:82.4,b:82.4,d:2},
  ATOM:{p:10.22,b:10.22,d:2},FTM:{p:0.482,b:0.482,d:4},
};
const SPARK_COINS = ['ETH','BNB','SOL','DOGE','ADA','AVAX'];
const sparkData = {};
SPARK_COINS.forEach(c=>{sparkData[c]=Array(20).fill(COINS[c].p)});

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
setInterval(()=>{
  document.getElementById('clock').textContent=
    new Date().toLocaleTimeString('en-US',{hour12:false});
},1000);

/* ══════════════════════════════════════════════
   COUNTDOWN
══════════════════════════════════════════════ */
setInterval(()=>{
  S.cd--;
  document.getElementById('countdown').textContent=S.cd+'s';
  if(S.cd<=0){S.cd=15;fetchAI();}
},1000);

/* ══════════════════════════════════════════════
   TICKER SIMULATION
══════════════════════════════════════════════ */
function jit(c,pct=.0015){
  c.p=Math.max(c.p*.95,Math.min(c.p*1.05,c.p*(1+(Math.random()-.5)*pct)));
}
setInterval(()=>{
  Object.values(COINS).forEach(jit);

  // top bar
  ['BTC','ETH','SOL','BNB'].forEach(sym=>{
    const c=COINS[sym];
    const chg=((c.p-c.b)/c.b*100).toFixed(2);
    const ve=document.getElementById('tbv-'+sym);
    const ce=document.getElementById('tbc-'+sym);
    if(!ve)return;
    ve.textContent='$'+c.p.toLocaleString(undefined,{minimumFractionDigits:c.d,maximumFractionDigits:c.d});
    ce.textContent=(chg>=0?'+':'')+chg+'%';
    ce.className='tb-chg '+(chg>=0?'pos':'neg');
  });

  // strip
  ['DOGE','ADA','AVAX','MATIC','LINK','DOT','UNI','LTC','ATOM','FTM'].forEach(sym=>{
    const c=COINS[sym];if(!c)return;
    const chg=((c.p-c.b)/c.b*100).toFixed(2);
    const pe=document.getElementById('sp-'+sym);
    const ce=document.getElementById('sc-'+sym);
    if(!pe)return;
    pe.textContent='$'+c.p.toFixed(c.d);
    ce.textContent=(chg>=0?'+':'')+chg+'%';
    ce.className='strip-chg '+(chg>=0?'pos':'neg');
  });

  // sparks
  SPARK_COINS.forEach(sym=>{
    sparkData[sym].shift();
    sparkData[sym].push(COINS[sym].p);
  });
  renderSparks();
},600);

/* ══════════════════════════════════════════════
   SPARKLINES
══════════════════════════════════════════════ */
function buildSparkList(){
  const container=document.getElementById('sparkList');
  container.innerHTML=SPARK_COINS.map(sym=>`
    <div class="spark-item">
      <span class="spark-sym">${sym}</span>
      <canvas class="spark-canvas" id="spk-${sym}" width="60" height="22"></canvas>
      <span class="spark-price" id="spkp-${sym}">$${COINS[sym].p.toFixed(COINS[sym].d)}</span>
    </div>`).join('');
}
function renderSparks(){
  SPARK_COINS.forEach(sym=>{
    const canvas=document.getElementById('spk-'+sym);
    if(!canvas)return;
    const ctx=canvas.getContext('2d');
    const data=sparkData[sym];
    const W=60,H=22;
    ctx.clearRect(0,0,W,H);
    const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
    const toX=i=>i/(data.length-1)*W;
    const toY=v=>H-((v-mn)/rng)*(H-2)-1;
    const c=COINS[sym];
    const isUp=data[data.length-1]>=data[0];
    ctx.beginPath();
    ctx.strokeStyle=isUp?'#00e676':'#ff2d55';
    ctx.lineWidth=1.5;
    data.forEach((v,i)=>i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)));
    ctx.stroke();
    // update price label
    const pe=document.getElementById('spkp-'+sym);
    if(pe)pe.textContent='$'+c.p.toFixed(c.d);
  });
}

/* ══════════════════════════════════════════════
   FETCH AI PREDICTION FROM RAILWAY BACKEND
══════════════════════════════════════════════ */
const RAILWAY_BASE='https://cloudflare-trader-production-xxxx.railway.app'; // REPLACE WITH YOUR RAILWAY URL

async function fetchAI(){
  try{
    // Call real Railway backend API
    const r=await fetch(`${RAILWAY_BASE}/api/intelligence-logs?limit=1`);
    const data=await r.json();

    if(data.logs && data.logs.length>0){
      const log=data.logs[0];
      const d={
        sig: log.recommendation,
        price: 43250 + (Math.random()*2400-1200), // Could fetch real price from Binance API
        confidence: log.confidence,
        rsi: Math.floor(Math.random()*45)+28,
        macd: (Math.random()*2.4-1.2).toFixed(3),
        ema20: 43250 * (1 + (Math.random()*.01-.005)),
        volume: Math.floor(Math.random()*60000+8000),
        bb_pos: Math.floor(Math.random()*100),
        ts: log.timestamp
      };
      applyAI(d);
    }
  }catch(e){
    console.error('Failed to fetch from Railway:',e);
    // Fallback to dummy data
    const r=Math.random();
    const sig=r<0.40?'BUY':r<0.75?'SELL':'HOLD';
    applyAI({
      sig,price:43250+(Math.random()*2400-1200),confidence:Math.floor(Math.random()*28)+63,
      rsi:Math.floor(Math.random()*45)+28,macd:(Math.random()*2.4-1.2).toFixed(3),
      ema20:43250*(1+(Math.random()*.01-.005)),volume:Math.floor(Math.random()*60000+8000),
      bb_pos:Math.floor(Math.random()*100),ts:new Date().toISOString()
    });
  }
}

function applyAI(d){
  S.prevP=S.lastP; S.lastP=d.price;
  COINS.BTC.p=d.price;

  // chart
  const candle={
    t:Date.now(),o:S.prevP,
    h:Math.max(d.price,S.prevP)+Math.random()*100,
    l:Math.min(d.price,S.prevP)-Math.random()*100,
    c:d.price,
  };
  S.candles.push(candle);
  if(S.candles.length>60)S.candles.shift();
  if(d.price>S.high24)S.high24=d.price;
  if(d.price<S.low24) S.low24=d.price;
  drawChart();

  // price header
  const diff=d.price-S.prevP;
  const dpct=((diff/S.prevP)*100).toFixed(2);
  const pe=document.getElementById('ch-price');
  const ce=document.getElementById('ch-change');
  pe.textContent='$'+d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  pe.style.color=diff>=0?'var(--green)':'var(--red)';
  setTimeout(()=>pe.style.color='#fff',700);
  ce.textContent=(diff>=0?'+':'')+diff.toFixed(2)+' ('+(diff>=0?'+':'')+dpct+'%)';
  ce.className='ch-change '+(diff>=0?'pos':'neg');

  // bottom stats
  document.getElementById('s-high').textContent='$'+S.high24.toFixed(0);
  document.getElementById('s-low').textContent='$'+S.low24.toFixed(0);
  document.getElementById('s-vol').textContent=(d.volume/1000).toFixed(1)+'K';

  // signal card
  const hero=document.getElementById('sigHero');
  const word=document.getElementById('sigWord');
  const sp=document.getElementById('sigPrice');
  hero.className='sig-hero '+d.sig;
  word.textContent=d.sig;
  sp.textContent='@ $'+d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('ai-ts').textContent=new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});

  // gauge
  const arc=138;
  const fill=document.getElementById('gaugeFill');
  const num=document.getElementById('gaugeNum');
  const offset=arc-(arc*(d.confidence/100));
  fill.style.strokeDashoffset=offset;
  const col=d.sig==='BUY'?'var(--green)':d.sig==='SELL'?'var(--red)':'var(--yellow)';
  fill.style.stroke=col;
  num.style.fill=col;
  num.textContent=d.confidence+'%';

  // indicators
  const rsi=document.getElementById('c-rsi');
  rsi.textContent=d.rsi;
  rsi.style.color=d.rsi>70?'var(--red)':d.rsi<30?'var(--green)':'#fff';
  const macd=document.getElementById('c-macd');
  macd.textContent=d.macd>0?'+'+d.macd:d.macd;
  macd.style.color=d.macd>0?'var(--green)':'var(--red)';
  document.getElementById('c-bb').textContent=d.bb_pos+'%';
  document.getElementById('c-ema').textContent='$'+parseFloat(d.ema20).toFixed(0);
  document.getElementById('c-vol').textContent=(d.volume/1000).toFixed(1)+'K';
  const trendTxt=d.sig==='BUY'?'↑ Bull':d.sig==='SELL'?'↓ Bear':'→ Side';
  const trend=document.getElementById('c-trend');
  trend.textContent=trendTxt;
  trend.style.color=col;

  // order flow
  S.flow=Math.max(20,Math.min(80,S.flow+(Math.random()-0.5)*12));
  const bp=Math.round(S.flow);
  document.getElementById('flow-buy').style.width=bp+'%';
  document.getElementById('flow-sell').style.width=(100-bp)+'%';
  document.getElementById('flow-pct').textContent=bp+'%';

  // session summary
  if(d.sig==='BUY')S.buySig++;
  else if(d.sig==='SELL')S.sellSig++;
  else S.holdSig++;
  document.getElementById('ss-total').textContent=S.buySig+S.sellSig+S.holdSig;
  document.getElementById('ss-buy').textContent=S.buySig;
  document.getElementById('ss-sell').textContent=S.sellSig;
  document.getElementById('ss-hold').textContent=S.holdSig;

  // log
  S.logs.unshift({sig:d.sig,p:d.price,conf:d.confidence,t:new Date()});
  if(S.logs.length>30)S.logs.pop();
  renderLog();
}

/* ══════════════════════════════════════════════
   SIGNAL LOG
══════════════════════════════════════════════ */
function renderLog(){
  const w=document.getElementById('logWrap');
  w.innerHTML=S.logs.map(l=>{
    const t=l.t.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
    return `<div class="le ${l.sig}">
      <div class="le-dot"></div>
      <span class="le-sig">${l.sig}</span>
      <span class="le-conf">${l.conf}%</span>
      <span class="le-price">$${l.p.toFixed(2)}</span>
      <span class="le-time">${t}</span>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   QUICK TRADE
══════════════════════════════════════════════ */
function placeOrder(side){
  const pnlDelta=(Math.random()*80-25)*(side==='BUY'?1:-1);
  S.pnl+=pnlDelta; S.pos++; S.tots++;
  if(pnlDelta>0)S.wins++;
  if(Math.abs(pnlDelta)>S.best)S.best=Math.abs(pnlDelta);

  const pnlEl=document.getElementById('pf-pnl');
  pnlEl.textContent=(S.pnl>=0?'+':'')+' $'+S.pnl.toFixed(2);
  pnlEl.className=S.pnl>=0?'g':'r';
  document.getElementById('pf-bal').textContent='$'+(S.bal+S.pnl).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('pf-pos').textContent=S.pos;
  document.getElementById('pf-tot').textContent=S.tots;
  document.getElementById('pf-wr').textContent=S.tots?Math.round(S.wins/S.tots*100)+'%':'--%';
  document.getElementById('pf-best').textContent=S.best>0?'+$'+S.best.toFixed(0):'--';

  S.trades.unshift({side,p:S.lastP,pnl:pnlDelta,t:new Date()});
  if(S.trades.length>4)S.trades.pop();
  const rt=document.getElementById('recentTrades');
  rt.innerHTML=S.trades.map(tr=>{
    const t=tr.t.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
    return `<div class="bot-row">
      <span class="sym ${tr.side==='BUY'?'pos':'neg'}">${tr.side}</span>
      <span style="font-variant-numeric:tabular-nums">$${tr.p.toFixed(0)}</span>
      <span class="${tr.pnl>=0?'pos':'neg'} val">${tr.pnl>=0?'+':''}\$${tr.pnl.toFixed(0)}</span>
      <span class="sym">${t}</span>
    </div>`;
  }).join('');

  S.logs.unshift({sig:side,p:S.lastP,conf:90,t:new Date()});
  if(S.logs.length>30)S.logs.pop();
  renderLog();
}

/* ══════════════════════════════════════════════
   CHART
══════════════════════════════════════════════ */
const canvas=document.getElementById('mainChart');
const ctx=canvas.getContext('2d');
let chartType='Candle';

function resizeChart(){
  const rect=canvas.parentElement.getBoundingClientRect();
  canvas.width=rect.width;canvas.height=rect.height;
  drawChart();
}
const resizeObs=new ResizeObserver(resizeChart);
resizeObs.observe(canvas.parentElement);

function drawChart(){
  const W=canvas.width,H=canvas.height;
  if(!W||!H||S.candles.length<2)return;
  ctx.clearRect(0,0,W,H);

  const pad={t:20,b:40,l:10,r:70};
  const cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
  const prices=S.candles.flatMap(c=>[c.h,c.l]);
  const mn=Math.min(...prices),mx=Math.max(...prices),rng=mx-mn||1;
  const toX=i=>pad.l+(i/(S.candles.length-1))*cW;
  const toY=v=>pad.t+cH-((v-mn)/rng)*cH;

  // ── grid ──
  for(let g=0;g<=4;g++){
    const y=pad.t+(g/4)*cH;
    ctx.strokeStyle='#22224a55';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    const lbl=(mx-(rng*g/4)).toFixed(0);
    ctx.fillStyle='#4a4a80';ctx.font='10px system-ui';ctx.textAlign='left';
    ctx.fillText('$'+lbl,W-pad.r+4,y+4);
  }

  if(chartType==='Candle'){
    // ── area fill under close ──
    const grad=ctx.createLinearGradient(0,pad.t,0,H-pad.b);
    grad.addColorStop(0,'rgba(240,165,0,.15)');
    grad.addColorStop(1,'rgba(240,165,0,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0),toY(S.candles[0].c));
    S.candles.forEach((c,i)=>ctx.lineTo(toX(i),toY(c.c)));
    ctx.lineTo(toX(S.candles.length-1),H-pad.b);
    ctx.lineTo(toX(0),H-pad.b);ctx.closePath();
    ctx.fillStyle=grad;ctx.fill();

    // ── candles ──
    const cw=Math.max(2,(cW/S.candles.length)*0.55);
    S.candles.forEach((c,i)=>{
      const x=toX(i),up=c.c>=c.o;
      const col=up?'#00e676':'#ff2d55';
      ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x,toY(c.h));ctx.lineTo(x,toY(c.l));ctx.stroke();
      const by=toY(Math.max(c.o,c.c));
      const bh=Math.max(1,Math.abs(toY(c.o)-toY(c.c)));
      ctx.fillRect(x-cw/2,by,cw,bh);
    });

    // ── close line ──
    ctx.beginPath();ctx.strokeStyle='#f0a500';ctx.lineWidth=2;
    ctx.shadowColor='#f0a50088';ctx.shadowBlur=8;
    S.candles.forEach((c,i)=>i===0?ctx.moveTo(toX(i),toY(c.c)):ctx.lineTo(toX(i),toY(c.c)));
    ctx.stroke();ctx.shadowBlur=0;

  } else {
    // ── line mode: smooth gradient area ──
    const grad=ctx.createLinearGradient(0,pad.t,0,H-pad.b);
    grad.addColorStop(0,'rgba(0,214,255,.3)');
    grad.addColorStop(1,'rgba(0,214,255,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0),toY(S.candles[0].c));
    for(let i=1;i<S.candles.length;i++){
      const x0=toX(i-1),y0=toY(S.candles[i-1].c);
      const x1=toX(i),y1=toY(S.candles[i].c);
      ctx.bezierCurveTo((x0+x1)/2,y0,(x0+x1)/2,y1,x1,y1);
    }
    ctx.lineTo(toX(S.candles.length-1),H-pad.b);
    ctx.lineTo(toX(0),H-pad.b);ctx.closePath();
    ctx.fillStyle=grad;ctx.fill();

    ctx.beginPath();ctx.strokeStyle='#00d4ff';ctx.lineWidth=2.5;
    ctx.shadowColor='#00d4ff66';ctx.shadowBlur=10;
    ctx.moveTo(toX(0),toY(S.candles[0].c));
    for(let i=1;i<S.candles.length;i++){
      const x0=toX(i-1),y0=toY(S.candles[i-1].c);
      const x1=toX(i),y1=toY(S.candles[i].c);
      ctx.bezierCurveTo((x0+x1)/2,y0,(x0+x1)/2,y1,x1,y1);
    }
    ctx.stroke();ctx.shadowBlur=0;
  }

  // ── last price marker ──
  const lc=S.candles[S.candles.length-1];
  const ly=toY(lc.c);
  ctx.strokeStyle='#f0a50055';ctx.lineWidth=1;ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(pad.l,ly);ctx.lineTo(W-pad.r,ly);ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#f0a500';
  ctx.beginPath();ctx.roundRect(W-pad.r+2,ly-10,62,20,4);ctx.fill();
  ctx.fillStyle='#000';ctx.font='bold 10px system-ui';ctx.textAlign='center';
  ctx.fillText('$'+lc.c.toFixed(0),W-pad.r+33,ly+4);

  // ── x labels ──
  ctx.fillStyle='#4a4a80';ctx.font='9px system-ui';ctx.textAlign='center';
  const step=Math.max(1,Math.floor(S.candles.length/6));
  for(let i=0;i<S.candles.length;i+=step){
    const t=new Date(S.candles[i].t);
    ctx.fillText(
      t.getHours().toString().padStart(2,'0')+':'+t.getMinutes().toString().padStart(2,'0'),
      toX(i),H-pad.b+14
    );
  }
}

/* ══════════════════════════════════════════════
   TF / TYPE BUTTONS
══════════════════════════════════════════════ */
document.querySelectorAll('.tf').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tf=btn.dataset.tf;
    if(['Line','Candle'].includes(tf)){
      document.querySelectorAll('.tf').forEach(b=>{
        if(['Line','Candle'].includes(b.dataset.tf))b.classList.remove('on');
      });
      chartType=tf;btn.classList.add('on');
    } else {
      document.querySelectorAll('.tf').forEach(b=>{
        if(!['Line','Candle'].includes(b.dataset.tf))b.classList.remove('on');
      });
      btn.classList.add('on');
      S.candles=[];fetchAI();
    }
    drawChart();
  });
});

/* ══════════════════════════════════════════════
   PAIR SWITCHER (visual only)
══════════════════════════════════════════════ */
document.querySelectorAll('.tb-pair').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('.tb-pair').forEach(e=>e.classList.remove('active'));
    el.classList.add('active');
  });
});

/* ══════════════════════════════════════════════
   MANUAL REFRESH
══════════════════════════════════════════════ */
function refresh(){S.cd=15;fetchAI();}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function init(){
  // seed 40 candles
  let p=43000;
  for(let i=40;i>=0;i--){
    p=Math.max(38000,Math.min(50000,p+(Math.random()-.47)*500));
    S.candles.push({t:Date.now()-i*15*60*1000,o:p,h:p+Math.random()*220,l:p-Math.random()*220,c:p+(Math.random()-.5)*180});
  }
  S.lastP=S.candles.at(-1).c; S.prevP=S.candles.at(-2).c;
  S.high24=Math.max(...S.candles.map(c=>c.h));
  S.low24=Math.min(...S.candles.map(c=>c.l));

  buildSparkList();
  renderSparks();
  resizeChart();

  await fetchAI();

  // hide loader
  setTimeout(()=>document.getElementById('loader').classList.add('hide'),400);
}
init();
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  },

  async scheduled(event, env, ctx) {
    console.log('NOVA TRADE bot tick:', new Date().toISOString());
    const sig = ['BUY','SELL','HOLD'][Math.floor(Math.random()*3)];
    const conf = Math.floor(Math.random()*25)+65;
    console.log(`Signal: ${sig} @ ${conf}% confidence`);
  }
};
