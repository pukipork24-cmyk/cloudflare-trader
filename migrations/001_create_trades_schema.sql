-- Migration: Create production-grade trades schema with explainability
-- Date: 2026-04-17

-- ── Trade Decisions (Aggregated AI recommendations) ────────────────────────
CREATE TABLE IF NOT EXISTS trade_decisions (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
  recommendation ENUM('BUY', 'SELL', 'HOLD') NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'EXTREME') NOT NULL,

  -- Agent breakdown
  technical_rec VARCHAR(20),
  technical_conf INTEGER,
  sentiment_rec VARCHAR(20),
  sentiment_conf INTEGER,
  fundamental_rec VARCHAR(20),
  fundamental_conf INTEGER,
  risk_rec VARCHAR(20),
  risk_conf INTEGER,
  portfolio_rec VARCHAR(20),
  portfolio_conf INTEGER,

  -- Intelligence analysis
  intelligence_narrative TEXT,
  consensus_quality ENUM('STRONG', 'MODERATE', 'WEAK'),
  red_flags JSONB,  -- ["flag1", "flag2"]
  conflicts JSONB,  -- ["conflict1", "conflict2"]

  -- CIO approval
  cio_decision ENUM('EXECUTE', 'SKIP', 'MODIFY'),
  cio_reasoning TEXT,

  -- Parameters
  entry_zone VARCHAR(50),
  stop_loss DECIMAL(20,8),
  target DECIMAL(20,8),
  timeframe VARCHAR(20),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_symbol (symbol),
  INDEX idx_recommendation (recommendation),
  INDEX idx_created_at (created_at DESC)
);

-- ── Trades (Individual executions) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  trade_decision_id INTEGER NOT NULL REFERENCES trade_decisions(id) ON DELETE CASCADE,

  -- Exchange reference
  bitget_order_id VARCHAR(50) NOT NULL UNIQUE,

  -- Position details
  coin VARCHAR(10) NOT NULL,
  direction ENUM('BUY', 'SELL', 'SHORT') NOT NULL,
  trade_type ENUM('SPOT', 'FUTURES') NOT NULL DEFAULT 'SPOT',
  leverage DECIMAL(5,2) DEFAULT 1.00 CHECK (leverage > 0 AND leverage <= 125),
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity > 0),

  -- Entry
  planned_entry_price DECIMAL(20,8) NOT NULL,
  actual_entry_price DECIMAL(20,8),
  slippage_pct DECIMAL(8,4),

  -- Risk management
  stop_loss DECIMAL(20,8) NOT NULL,
  take_profit_1 DECIMAL(20,8) NOT NULL,
  take_profit_2 DECIMAL(20,8),
  take_profit_3 DECIMAL(20,8),

  -- Exit tracking
  status ENUM('OPEN', 'CLOSED', 'STOPPED', 'PARTIAL', 'LIQUIDATED') NOT NULL DEFAULT 'OPEN',
  close_price DECIMAL(20,8),
  close_reason ENUM('TP1', 'TP2', 'TP3', 'SL', 'TIMEOUT', 'MANUAL', 'LIQUIDATED'),

  -- Partial exits (if using multiple TPs)
  tp1_filled_qty DECIMAL(20,8),
  tp1_filled_price DECIMAL(20,8),
  tp1_filled_at TIMESTAMPTZ,
  tp2_filled_qty DECIMAL(20,8),
  tp2_filled_price DECIMAL(20,8),
  tp2_filled_at TIMESTAMPTZ,
  tp3_filled_qty DECIMAL(20,8),
  tp3_filled_price DECIMAL(20,8),
  tp3_filled_at TIMESTAMPTZ,

  -- P&L tracking
  pnl_usdt DECIMAL(20,8),
  pnl_pct DECIMAL(10,4),
  commission_usdt DECIMAL(20,8) DEFAULT 0,
  net_pnl_usdt DECIMAL(20,8),  -- pnl_usdt - commission_usdt
  roi_pct DECIMAL(10,4),       -- Return on invested capital

  -- Timing
  timeframe VARCHAR(20),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  hold_duration_minutes INTEGER,  -- For analysis

  -- AI Analysis (explainability trail)
  agent_confidence INTEGER CHECK (agent_confidence >= 0 AND agent_confidence <= 100),
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'EXTREME'),
  cio_decision VARCHAR(20),

  -- Full audit trail as JSON
  intelligence_brief JSONB,  -- {"narrative": "...", "consensus_quality": "...", "red_flags": [...]}
  agent_breakdown JSONB,     -- {"technical": 78, "sentiment": 72, "fundamental": 65, "risk": 70, "portfolio": 68}

  -- Constraints
  CONSTRAINT valid_status CHECK (
    (status = 'CLOSED' AND close_price IS NOT NULL AND closed_at IS NOT NULL) OR
    (status IN ('OPEN', 'PARTIAL', 'STOPPED', 'LIQUIDATED'))
  ),
  CONSTRAINT valid_pnl CHECK (
    (status = 'CLOSED' AND pnl_usdt IS NOT NULL) OR
    (status IN ('OPEN', 'PARTIAL', 'STOPPED'))
  ),
  CONSTRAINT entry_price_check CHECK (actual_entry_price > 0 OR actual_entry_price IS NULL),
  CONSTRAINT close_price_check CHECK (close_price > 0 OR close_price IS NULL),

  -- Indexes for fast queries
  INDEX idx_status (status),
  INDEX idx_opened_at (opened_at DESC),
  INDEX idx_trade_decision (trade_decision_id),
  INDEX idx_coin_status (coin, status),
  INDEX idx_bitget_order (bitget_order_id),
  INDEX idx_pnl (net_pnl_usdt),
  INDEX idx_closed_at (closed_at DESC)
);

-- ── Trade Analytics (Summary view for reporting) ───────────────────────────
CREATE TABLE IF NOT EXISTS trade_analytics (
  id SERIAL PRIMARY KEY,

  -- Daily/Weekly/Monthly stats
  period_date DATE NOT NULL,
  period_type ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,

  -- Performance
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),

  -- PnL
  total_pnl_usdt DECIMAL(20,8),
  total_commission_usdt DECIMAL(20,8),
  net_pnl_usdt DECIMAL(20,8),
  avg_pnl_per_trade DECIMAL(20,8),
  largest_win DECIMAL(20,8),
  largest_loss DECIMAL(20,8),

  -- Risk
  max_drawdown_pct DECIMAL(10,4),
  avg_hold_duration_hours DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE KEY unique_period (period_date, period_type),
  INDEX idx_period_date (period_date)
);

-- ── Seeds (optional: add sample data for testing) ──────────────────────────
-- INSERT INTO trade_decisions (symbol, recommendation, confidence, risk_level, cio_decision, created_at)
-- VALUES ('BTC', 'BUY', 75, 'MEDIUM', 'EXECUTE', NOW());
