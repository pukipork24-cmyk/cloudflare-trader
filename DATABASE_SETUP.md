# Database Setup Guide

## Overview

This trading system uses PostgreSQL to log:
1. **Trade Decisions** - Aggregated AI recommendations with full agent breakdown
2. **Trades** - Individual trade executions with P&L tracking
3. **Analytics** - Daily/weekly/monthly performance summaries

## Prerequisites

You need a PostgreSQL database. Options:

### Option 1: Supabase (Recommended for Cloudflare Workers)
- Free tier: 500MB storage, perfect for testing
- Easy integration with Cloudflare Workers
- Hosted + managed

**Setup:**
1. Create account at https://supabase.com
2. Create new project
3. Copy connection string from project settings
4. Add to wrangler.toml secrets

### Option 2: Neon (PostgreSQL Serverless)
- Free tier: generous limits
- Optimized for serverless workloads
- https://neon.tech

### Option 3: Local PostgreSQL
- For development only
- `brew install postgresql` (macOS)
- Or Docker: `docker run -e POSTGRES_PASSWORD=secret -d postgres`

## Installation Steps

### 1. Set Up Database

```bash
# Connect to your PostgreSQL instance
psql -U postgres -h your-host.com -d postgres

# Create database
CREATE DATABASE pukitradev2;
\c pukitradev2

# Run migration
\i migrations/001_create_trades_schema.sql
```

### 2. Add Connection String to Cloudflare

```bash
# Add DATABASE_URL to wrangler secrets
npx wrangler secret put DATABASE_URL

# Paste your connection string:
# postgresql://user:password@host.com:5432/pukitradev2
```

### 3. Update Wrangler Config

Add to `wrangler.toml`:
```toml
[env.production]
vars = { DATABASE_POOL_SIZE = "5" }
```

### 4. Test Connection

```bash
node -e "
const db = require('./src/db.js');
db.queryDatabase({ DATABASE_URL: process.env.DATABASE_URL }, 
  'SELECT NOW()', []).then(r => console.log('Connected!'));
"
```

## Schema Overview

### trade_decisions Table
Stores aggregated AI recommendations:
- Symbol, recommendation, confidence
- Individual agent votes (technical, sentiment, fundamental, risk, portfolio)
- Intelligence analysis (narrative, red flags, conflicts)
- CIO approval decision and reasoning
- Entry/stop/target zones

Example:
```sql
SELECT * FROM trade_decisions 
WHERE recommendation = 'BUY' AND confidence >= 75
ORDER BY created_at DESC LIMIT 10;
```

### trades Table
Stores individual trade executions:
- Position details (coin, quantity, leverage, entry price)
- Risk parameters (stop loss, take profit levels)
- Exit tracking (status, close reason, P&L)
- Partial exits (TP1, TP2, TP3 fills)
- Full AI audit trail (agent breakdown, intelligence brief)

Example:
```sql
SELECT 
  coin, direction, quantity, planned_entry_price, actual_entry_price,
  net_pnl_usdt, status, closed_at
FROM trades
WHERE status = 'CLOSED'
ORDER BY closed_at DESC LIMIT 20;
```

### trade_analytics Table
Daily/weekly/monthly summaries for reporting:
- Win rate, average P&L, largest win/loss
- Max drawdown, hold duration
- Commission tracking

Example:
```sql
SELECT * FROM trade_analytics
WHERE period_type = 'DAILY'
ORDER BY period_date DESC LIMIT 30;
```

## Integration with Cron

When a trade executes in your cron job, log it:

```javascript
import { logTradeDecision, logTrade, closeTrade } from './src/db.js';

// After aggregation
const decisionId = await logTradeDecision(env, aggregation);

// After execution
const trade = await logTrade(env, {
  trade_decision_id: decisionId,
  bitget_order_id: entryResp.orderId,
  coin: 'BTC',
  direction: 'BUY',
  quantity: positionSize,
  entry_price: entryPrice,
  stop_loss: agg.stop_loss,
  take_profit_1: agg.target,
  agent_breakdown: agg.agents,
  intelligence_brief: intelligenceAgent.raw,
  cio_decision: executionAgent.recommendation
});

// When trade closes (later)
await closeTrade(env, trade.id, {
  close_price: exitPrice,
  close_reason: 'TP1',
  pnl_usdt: profit,
  pnl_pct: profitPct,
  commission_usdt: fees
});
```

## Queries for Analysis

### Find All BUY Trades That Hit TP1
```sql
SELECT * FROM trades
WHERE direction = 'BUY' 
  AND close_reason = 'TP1'
  AND status = 'CLOSED'
ORDER BY closed_at DESC;
```

### Calculate Win Rate by Agent Confidence
```sql
SELECT 
  agent_confidence,
  COUNT(*) as total,
  ROUND(SUM(CASE WHEN net_pnl_usdt > 0 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as win_rate,
  ROUND(AVG(net_pnl_usdt), 2) as avg_pnl
FROM trades
WHERE status = 'CLOSED'
GROUP BY agent_confidence
ORDER BY agent_confidence DESC;
```

### Find Trades with Red Flags That Still Succeeded
```sql
SELECT * FROM trades
WHERE intelligence_brief->'red_flags' @> '[]'::jsonb
  AND net_pnl_usdt > 0
  AND status = 'CLOSED'
ORDER BY net_pnl_usdt DESC;
```

### Daily P&L Trend
```sql
SELECT 
  DATE(opened_at) as trading_day,
  COUNT(*) as trades,
  ROUND(SUM(net_pnl_usdt), 2) as daily_pnl,
  ROUND(AVG(net_pnl_usdt), 2) as avg_trade
FROM trades
WHERE status = 'CLOSED'
GROUP BY DATE(opened_at)
ORDER BY trading_day DESC
LIMIT 30;
```

## Monitoring

### Check Database Health
```bash
# Total trades logged
SELECT COUNT(*) FROM trades;

# Open positions
SELECT * FROM trades WHERE status = 'OPEN';

# Monthly P&L
SELECT SUM(net_pnl_usdt) FROM trades 
WHERE opened_at >= NOW() - INTERVAL '30 days' AND status = 'CLOSED';
```

### Backup Strategy
```bash
# Weekly backup
pg_dump -U user -h host -d pukitradev2 > backup_$(date +%Y%m%d).sql

# Or use Supabase backup feature (automated daily)
```

## Troubleshooting

**"DATABASE_URL not configured"**
- Run: `npx wrangler secret put DATABASE_URL`
- Verify: `npx wrangler secret list`

**Connection timeout**
- Check firewall/IP whitelist on your DB host
- Verify connection string format: `postgresql://user:pass@host:5432/db`

**"relation does not exist"**
- Run migration: `psql -U user -d pukitradev2 -f migrations/001_create_trades_schema.sql`

**Slow queries on large datasets**
- Create additional indexes: `CREATE INDEX idx_coin_date ON trades(coin, opened_at DESC);`
- Archive old trades to separate table quarterly

## Next Steps

1. Run the migration script
2. Add DATABASE_URL to wrangler secrets
3. Update `src/index.js` to call `logTradeDecision()` and `logTrade()`
4. Deploy: `wrangler deploy`
5. Monitor queries in database dashboard

Your trades are now fully logged with complete explainability! 📊
