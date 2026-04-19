# AI Crypto Trading Bot System — Complete Build

## Overview
Build a production-ready, multi-agent AI cryptocurrency trading system with a web dashboard.
Deploy target: Digital Ocean Ubuntu 22.04 (minimum 2GB RAM recommended).
All components run via Docker Compose.

---

## Tech Stack
- AI Agents: Python 3.11
- Web Dashboard: Node.js with Next.js 14 (App Router)
- Database: PostgreSQL 15
- Cache & Message Queue: Redis 7
- Container Orchestration: Docker Compose
- Reverse Proxy: Nginx
- Authentication: NextAuth.js (single-user)
- Version Control for Evolution: GitPython (local git repo for agent code changes)

---

## Agent Architecture (8 Agents)

All agents communicate via Redis pub/sub. No direct function calls between agents.
Master orchestrator (main.py) triggers the 5-minute cycle via APScheduler.

---

### AI1 — Technical Analysis Agent (Python)

Triggered: Every 5 minutes

Responsibilities:
- Fetch OHLCV data from Bitget for all active trading pairs (dynamic list from config)
- Timeframes: 1m, 5m, 15m, 1h, 4h simultaneously
- Calculate using pandas-ta:
  - Trend: EMA(9,21,50,200), MACD(12,26,9), ADX(14)
  - Momentum: RSI(14), Stochastic RSI, CCI(20), Williams %R
  - Volatility: Bollinger Bands(20,2), ATR(14), Keltner Channels
  - Volume: OBV, VWAP, Volume Profile (POC, VAH, VAL)
  - Structure: Detect support/resistance (pivot points, last 20 candle highs/lows)
  - Patterns: Engulfing, Doji, Pin Bar, Inside Bar via candlestick pattern detection
- Multi-timeframe confluence: signal only valid if 3+ timeframes agree
- Output: Publish JSON to Redis channel "ai1_report" with:
  {coin, timeframe_signals, indicator_values, pattern_detected, entry_zone, stop_loss_suggestion, take_profit_levels[3], confidence_score(0-100), timestamp}

Self-Evolution (runs every 24h via separate scheduler):
- Scope: Optimize indicator parameters (RSI period 7-21, EMA periods, BB deviation 1.5-3.0, ATR multiplier 1.0-3.0, confluence threshold)
- Method: Walk-forward optimization
  - Training window: last 30 days of trade results
  - Validation window: most recent 7 days (never used in training, strict separation)
  - Metric: Sharpe ratio improvement > 5% required to adopt new params
  - Minimum 20 completed trades required before first evolution attempt
- Also allowed to evolve: strategy logic (e.g., add/remove an indicator from confluence check, adjust pattern weight)
- Code structure changes: AI1 may propose refactoring its own analysis pipeline. Changes are:
  1. Written to /evolution/pending/ai1_TIMESTAMP.py
  2. Run in paper trading sandbox for 24 hours
  3. Compared against current version by Sharpe ratio
  4. If better AND passes safety checks, staged for user approval in dashboard
  5. User clicks "Apply Update" → code deployed, git commit created, old version tagged
- STRICT PROHIBITION: AI1 may NEVER modify: bitget_client.py, ai5_risk.py, ai6_cio.py execution logic, database schema, authentication

---

### AI2 — Telegram News Agent (Python)

Triggered: Every 5 minutes

Responsibilities:
- Monitor Telegram channels using Telethon library:
  @WhaleCryptoAlert, @CryptoNewsFlash, @CoinDesk, @Cointelegraph,
  @binance_announcements, @bybit_announcements, @DefiLlama, @glassnode
- Only process messages from last 10 minutes
- For each message:
  - Extract mentioned coins (regex + known coin list)
  - Classify sentiment: POSITIVE / NEGATIVE / NEUTRAL (use simple keyword scoring)
  - Calculate urgency score 1-10 (keywords: hack/exploit=10, listing=8, partnership=6, update=4)
  - Detect: exchange listings, protocol exploits, regulatory news, major partnerships
- Output: Publish JSON to Redis "ai2_report":
  {news_items:[{text_summary, coins_mentioned[], sentiment, urgency, source, timestamp}], overall_market_sentiment, high_urgency_alerts[]}

Note: Telethon requires manual first-time phone verification. Provide clear instructions for this step.

---

### AI3 — Whale Wallet Tracker (Python)

Triggered: Every 5 minutes

Responsibilities:
- Whale Alert API: fetch transactions > $500,000 USD in last 10 minutes
  Endpoint: https://api.whale-alert.io/v1/transactions?min_value=500000
- Bitget WebSocket: monitor large orders > $100,000 USD on tracked pairs
- Etherscan API: track top 20 known whale wallet addresses for ETH movements
- Binance Smart Chain: track large BEP-20 movements via BscScan API
- Analysis:
  - Exchange inflow (bearish signal) vs outflow (bullish signal)
  - Accumulation pattern: same wallet buying multiple times in 1h
  - Distribution pattern: large wallet splitting into many wallets
  - Classify each whale movement: BULLISH_PRESSURE / BEARISH_PRESSURE / NEUTRAL
- Output: Publish JSON to Redis "ai3_report":
  {whale_transactions[], net_pressure_per_coin{coin: BULLISH/BEARISH/NEUTRAL}, large_order_walls{}, summary}

---

### AI4 — Aggregator + DeepSeek Consultant (Python)

Triggered: Every 5 minutes, after receiving reports from AI1+AI2+AI3 (wait up to 90 seconds with timeout)

Responsibilities:
- Subscribe to Redis channels: ai1_report, ai2_report, ai3_report
- Wait for all 3 reports from current cycle (match by cycle_id/timestamp window)
- Build structured prompt combining all signals
- Call DeepSeek API:
  - Model: deepseek-chat
  - Max tokens: 2000
  - System prompt:
    "You are a professional cryptocurrency trading analyst and portfolio manager.
     Analyze the provided technical analysis, news sentiment, and whale movement data.
     Consider confluence between all three data sources. Higher weight to signals confirmed by 2+ sources.
     Return ONLY valid JSON, no markdown, no explanation outside JSON:
     {
       'recommended_trades': [
         {
           'coin': 'BTC/USDT',
           'action': 'BUY' or 'SELL' or 'HOLD',
           'confidence': 0-100,
           'timeframe': 'INTRADAY' or 'SWING',
           'entry_price': 0.0,
           'stop_loss': 0.0,
           'take_profit': [tp1, tp2, tp3],
           'suggested_leverage': 1-10,
           'reasoning': 'brief explanation',
           'key_risks': 'main risk factors'
         }
       ],
       'market_regime': 'TRENDING_BULL' or 'TRENDING_BEAR' or 'RANGING' or 'HIGH_VOLATILITY',
       'market_sentiment': 'BULLISH' or 'BEARISH' or 'NEUTRAL',
       'risk_level': 'LOW' or 'MEDIUM' or 'HIGH',
       'do_not_trade': ['list of coins to avoid this cycle'],
       'summary': 'one paragraph market summary'
     }
     Rules: Only recommend trades with confidence >= 70. Maximum 3 simultaneous recommendations.
     For SWING trades, max hold suggestion 3 days. For INTRADAY, max hold 24 hours."
  
- Save full cycle data to database: agent_reports table (all 4 reports) + deepseek raw response
- Publish to Redis "ai4_report": DeepSeek parsed response + cycle_id
- If DeepSeek API fails: retry once after 10 seconds, then publish empty recommendations with error flag

---

### AI5 — Risk Analyst (Python)

Triggered: Every 5 minutes, runs IN PARALLEL with AI1-3 (not waiting for them)

Responsibilities:
- Fetch current open positions from Bitget API
- Calculate portfolio metrics:
  - Total portfolio value in USDT
  - Exposure per coin as % of total portfolio (hard limit: 30% per coin)
  - Current leverage per position
  - Unrealized PnL per position
  - Portfolio peak value (rolling 30-day high)
  - Current drawdown from peak %
- Risk rules (these parameters CAN be adjusted by evolution within bounds):
  - Per-trade max loss: default 2%, user-configurable 0.1%-10%
  - Max simultaneous open trades: default 3, range 1-5
  - Max total portfolio leverage exposure: default 3x, range 1x-10x
  - Realized volatility circuit breaker: if 1h realized vol > 5%, reduce all new position sizes by 50%
  - Drawdown circuit breaker: if portfolio drawdown > 15% from peak, HALT all new trades, alert user
  - Consecutive loss circuit breaker: if 3 consecutive losses each > 5%, PAUSE trading for 6 hours
- For each recommended trade from AI4:
  - Approve / Reject with reason
  - If approved: calculate exact position size in USDT and quantity
  - Position sizing formula: (Portfolio Value × Risk%) ÷ (Entry Price - Stop Loss Price)
  - Adjust leverage to match suggested leverage but cap at user's max setting
- Output: Publish to Redis "ai5_risk_approval":
  {approved_trades:[{...trade + position_size + quantity + leverage}], rejected_trades:[{...reason}], portfolio_health:{drawdown%, exposure{}, circuit_breakers_active[]}}

Evolution scope for AI5:
- MAY adjust: circuit breaker thresholds (within safety bounds), volatility multipliers, position sizing formula variations
- MAY NOT adjust: hard maximum per-trade loss %, drawdown halt threshold (these require user action)

---

### AI6 — Chief Investment Officer (Python)

Triggered: Every 5 minutes, after receiving AI4 + AI5 reports

Responsibilities:
- Subscribe to Redis: ai4_report, ai5_risk_approval
- For each risk-approved trade:
  - Review DeepSeek reasoning + risk parameters
  - Apply personal investment strategy rules (configurable in settings):
    - Minimum confidence threshold (default 70, range 60-90)
    - Preferred trade types (intraday / swing / both)
    - Blacklisted coins (user-defined)
    - Minimum reward:risk ratio (default 2:1)
  - FINAL DECISION: EXECUTE / SKIP / MODIFY
  - If MODIFY: adjust entry (tighten to limit order), adjust leverage downward only
  - If EXECUTE:
    1. Log full decision record to database BEFORE sending to Bitget
    2. Call bitget_client.py to place order
    3. For futures: set isolated margin mode, set leverage, place entry + stop loss + take profit as OCO
    4. For spot: place limit buy + set stop loss alert
    5. Log execution result (success/failure, actual fill price, order ID)
  - Auto-close logic: set maximum hold timer (intraday=24h, swing=72h), scheduler will close position if TP/SL not hit
- Output: Publish to Redis "ai6_decisions": {executed[], skipped[], modified[], cycle_summary}

---

### AI7 — UX Improvement Agent (Python + Anthropic API)

Triggered: Weekly (every Sunday 00:00) + on-demand via dashboard button

Responsibilities:
- Weekly analysis:
  - Query database for: most viewed pages, user interaction patterns (clicks, time on page)
  - Analyze system_logs for recurring errors or slow queries
  - Generate improvement report: list of suggested UI/UX changes ranked by impact
  - Save report to database, notify via dashboard badge
- On-demand (user clicks "Improve Dashboard"):
  - User describes what they want improved (text input)
  - AI7 calls Claude API (claude-sonnet-4-20250514):
    System: "You are a Next.js 14 + Tailwind CSS expert. Generate production-ready component code."
    User: [description + current component code + design system context]
  - Generated code saved to /pending_updates/ui_TIMESTAMP/
  - Shown in dashboard preview iframe for user review
  - User clicks "Apply" → file written, Next.js hot reloads (dev) or rebuilds (prod)
  - All changes tracked in git with descriptive commit messages
- AI7 may NOT touch: authentication code, API route handlers, database schema, agent Python files

---

### AI8 — Backtester & Performance Analyzer (Python)

Triggered: After each evolution event + on-demand

Responsibilities:
- When triggered after evolution: backtest old vs new parameters on last 90 days of price data
- Generate comparison report: win rate, Sharpe ratio, max drawdown, avg trade duration, profit factor
- Store results in evolution_history table
- On-demand: user can select date range + strategy parameters to backtest from dashboard
- Output: Save backtest results as JSON + generate equity curve data for chart display

---

## Dynamic Trading Pairs System

Coin selection logic (runs every 1 hour):
- Fetch all USDT pairs from Bitget
- Filter criteria:
  - 24h volume > $50,000,000 USD
  - Available for futures trading
  - Not in user blacklist
- Always include: BTC/USDT, ETH/USDT (cannot be removed)
- Select top N by volume (N configurable in settings, default 10, max 20)
- Save active pairs list to Redis key "active_trading_pairs"
- All agents read from this Redis key (not hardcoded)

---

## Database Schema (PostgreSQL)

```sql
-- Cycle tracking
CREATE TABLE trade_cycles (
  id SERIAL PRIMARY KEY,
  cycle_id UUID DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) -- running/completed/failed
);

-- Individual agent reports per cycle
CREATE TABLE agent_reports (
  id SERIAL PRIMARY KEY,
  cycle_id UUID REFERENCES trade_cycles(cycle_id),
  agent_name VARCHAR(20),
  report_json JSONB,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full decision chain per recommended trade
CREATE TABLE trade_decisions (
  id SERIAL PRIMARY KEY,
  cycle_id UUID,
  coin VARCHAR(20),
  action VARCHAR(10),
  confidence INTEGER,
  deepseek_reasoning TEXT,
  risk_approved BOOLEAN,
  risk_rejection_reason TEXT,
  cio_decision VARCHAR(20),
  cio_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Executed trades
CREATE TABLE executed_trades (
  id SERIAL PRIMARY KEY,
  trade_decision_id INTEGER REFERENCES trade_decisions(id),
  bitget_order_id VARCHAR(50),
  coin VARCHAR(20),
  direction VARCHAR(10),
  entry_price DECIMAL(20,8),
  quantity DECIMAL(20,8),
  leverage INTEGER DEFAULT 1,
  stop_loss DECIMAL(20,8),
  take_profit_1 DECIMAL(20,8),
  take_profit_2 DECIMAL(20,8),
  take_profit_3 DECIMAL(20,8),
  trade_type VARCHAR(20), -- spot/futures
  timeframe VARCHAR(20), -- intraday/swing
  status VARCHAR(20), -- open/closed/stopped
  close_price DECIMAL(20,8),
  pnl_usdt DECIMAL(20,8),
  pnl_pct DECIMAL(10,4),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  close_reason VARCHAR(50) -- tp1/tp2/tp3/sl/timeout/manual
);

-- Portfolio snapshots every 5 min
CREATE TABLE portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  total_value_usdt DECIMAL(20,8),
  available_usdt DECIMAL(20,8),
  positions_json JSONB,
  drawdown_pct DECIMAL(10,4),
  peak_value_usdt DECIMAL(20,8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evolution history
CREATE TABLE evolution_history (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(20),
  evolution_type VARCHAR(30), -- parameter/strategy_logic/code_structure
  parameter_name VARCHAR(50),
  old_value JSONB,
  new_value JSONB,
  sharpe_before DECIMAL(10,4),
  sharpe_after DECIMAL(10,4),
  backtest_summary JSONB,
  status VARCHAR(20), -- pending_approval/approved/rejected/rolled_back
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  git_commit_hash VARCHAR(40)
);

-- Structured logs
CREATE TABLE system_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10), -- DEBUG/INFO/WARNING/ERROR/CRITICAL
  agent_name VARCHAR(20),
  event_type VARCHAR(50),
  message TEXT,
  data_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Circuit breaker state
CREATE TABLE circuit_breakers (
  id SERIAL PRIMARY KEY,
  breaker_type VARCHAR(50),
  triggered_at TIMESTAMPTZ,
  reason TEXT,
  resume_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);
```

---

## Web Dashboard Pages (Next.js 14)

Design: Dark theme, trading terminal aesthetic (similar to TradingView dark), accent color #00D4AA (teal-green)

### /login
- Email + password form
- Single user auth via NextAuth.js credentials provider
- Password stored as bcrypt hash in .env

### /dashboard (main)
- Top bar: Portfolio value, 24h PnL, Win rate (30d), System status indicator
- Left panel: Current open positions with live PnL (updates every 30s via WebSocket)
- Center: TradingView Lightweight Charts showing active coins with entry markers
- Right panel: Last cycle summary — AI1 signals, AI2 sentiment, AI3 whale activity, AI4 recommendation, AI6 decision
- Bottom: Live log stream (last 20 entries, color coded by level)
- Circuit breaker alert banner (shows if any breaker is active)

### /trades
- Filterable table: date range, coin, status, direction
- Each row expandable: shows full decision chain (AI1→AI2→AI3→AI4→AI5→AI6)
- Columns: Time, Coin, Direction, Entry, Exit, PnL%, Leverage, Hold Duration, Close Reason
- Export to CSV button

### /signals
- Coin selector dropdown (all active trading pairs)
- TradingView Lightweight Charts with all AI1 indicators overlaid
- Multi-timeframe panel (5m, 15m, 1h, 4h tabs)
- Last signal timestamp + confidence gauge

### /agents
- Card per agent (AI1-AI8)
- Each card shows: status (running/idle/error), last run time, next scheduled run, last execution time in ms
- Evolution section: timeline of all evolution events, before/after metrics, approve/reject pending proposals
- Per-agent enable/disable toggle
- "Run Now" button for manual trigger

### /risk
- Portfolio exposure donut chart per coin
- Drawdown meter (gauge from 0% to 20%)
- Leverage exposure bar chart
- Active circuit breakers panel
- Risk settings: sliders for per-trade max loss, max leverage, max concurrent trades
- Trade history: consecutive losses tracker

### /backtest
- Date range picker
- Strategy parameter inputs (or "use current parameters" checkbox)
- Run Backtest button → calls AI8
- Results: equity curve chart, metrics table (win rate, Sharpe, max drawdown, profit factor, total trades)
- Compare mode: overlay two backtest runs

### /evolution
- Pending code changes awaiting approval (diff viewer)
- Evolution history timeline
- Rollback button per evolution event
- Sandbox test results for pending changes

### /settings
- API Keys section: Bitget (key + secret + passphrase), DeepSeek, Telegram, Whale Alert, Etherscan, Anthropic
- Trading preferences: active pairs, max pairs N, blacklist, max leverage, per-trade risk %
- Schedule settings: cycle interval (default 5min)
- AI7 UX improvement request text area + "Generate Improvement" button

### /logs
- Full structured log viewer
- Filters: agent, level, event_type, date range, keyword search
- Auto-refresh toggle
- Export logs button

---

## File Structure