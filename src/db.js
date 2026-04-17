// Database helper for trade logging and analytics
// Connects to PostgreSQL to store trade decisions and executions

export async function logTradeDecision(env, decision) {
  // Store the aggregated AI recommendation
  if (!env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured, skipping trade decision log');
    return null;
  }

  const query = `
    INSERT INTO trade_decisions (
      symbol, recommendation, confidence, risk_level,
      technical_rec, technical_conf,
      sentiment_rec, sentiment_conf,
      fundamental_rec, fundamental_conf,
      risk_rec, risk_conf,
      portfolio_rec, portfolio_conf,
      intelligence_narrative, consensus_quality, red_flags, conflicts,
      cio_decision, cio_reasoning,
      entry_zone, stop_loss, target, timeframe
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20,
      $21, $22, $23, $24
    ) RETURNING id;
  `;

  const values = [
    decision.symbol,
    decision.recommendation,
    decision.confidence,
    decision.risk_level,
    decision.agents?.technical?.recommendation,
    decision.agents?.technical?.confidence,
    decision.agents?.sentiment?.recommendation,
    decision.agents?.sentiment?.confidence,
    decision.agents?.fundamental?.recommendation,
    decision.agents?.fundamental?.confidence,
    decision.agents?.risk?.recommendation,
    decision.agents?.risk?.confidence,
    decision.agents?.portfolio?.recommendation,
    decision.agents?.portfolio?.confidence,
    decision.intelligence_brief?.narrative,
    decision.intelligence_brief?.consensus_quality,
    JSON.stringify(decision.intelligence_brief?.red_flags || []),
    JSON.stringify(decision.intelligence_brief?.conflicts || []),
    decision.cio_decision,
    decision.cio_reasoning,
    decision.entry_zone,
    decision.stop_loss,
    decision.target,
    decision.timeframe
  ];

  try {
    const result = await queryDatabase(env, query, values);
    return result.rows[0]?.id;
  } catch (e) {
    console.error('Failed to log trade decision:', e.message);
    return null;
  }
}

export async function logTrade(env, tradeData) {
  // Store the actual trade execution
  if (!env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured, skipping trade log');
    return null;
  }

  const query = `
    INSERT INTO trades (
      trade_decision_id, bitget_order_id, coin, direction, trade_type, leverage,
      quantity, planned_entry_price, actual_entry_price, slippage_pct,
      stop_loss, take_profit_1, take_profit_2, take_profit_3,
      status, timeframe,
      agent_confidence, risk_level, cio_decision,
      intelligence_brief, agent_breakdown
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16,
      $17, $18, $19,
      $20, $21
    ) RETURNING id, opened_at;
  `;

  const values = [
    tradeData.trade_decision_id,
    tradeData.bitget_order_id,
    tradeData.coin,
    tradeData.direction,
    tradeData.trade_type || 'SPOT',
    tradeData.leverage || 1,
    tradeData.quantity,
    tradeData.entry_price,
    tradeData.actual_entry_price,
    tradeData.slippage_pct,
    tradeData.stop_loss,
    tradeData.take_profit_1,
    tradeData.take_profit_2,
    tradeData.take_profit_3,
    tradeData.status || 'OPEN',
    tradeData.timeframe,
    tradeData.confidence,
    tradeData.risk_level,
    tradeData.cio_decision,
    JSON.stringify(tradeData.intelligence_brief),
    JSON.stringify(tradeData.agent_breakdown)
  ];

  try {
    const result = await queryDatabase(env, query, values);
    return result.rows[0];
  } catch (e) {
    console.error('Failed to log trade:', e.message);
    return null;
  }
}

export async function closeTrade(env, tradeId, closeData) {
  // Mark a trade as closed and record P&L
  if (!env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured, skipping trade close');
    return null;
  }

  const query = `
    UPDATE trades
    SET
      status = $2,
      close_price = $3,
      close_reason = $4,
      closed_at = NOW(),
      pnl_usdt = $5,
      pnl_pct = $6,
      commission_usdt = $7,
      net_pnl_usdt = $8,
      hold_duration_minutes = EXTRACT(EPOCH FROM (NOW() - opened_at)) / 60
    WHERE id = $1
    RETURNING *;
  `;

  const values = [
    tradeId,
    closeData.status || 'CLOSED',
    closeData.close_price,
    closeData.close_reason,
    closeData.pnl_usdt,
    closeData.pnl_pct,
    closeData.commission_usdt || 0,
    (parseFloat(closeData.pnl_usdt) || 0) - (parseFloat(closeData.commission_usdt) || 0)
  ];

  try {
    const result = await queryDatabase(env, query, values);
    return result.rows[0];
  } catch (e) {
    console.error('Failed to close trade:', e.message);
    return null;
  }
}

export async function recordPartialExit(env, tradeId, tpLevel, quantity, price) {
  // Record a partial exit (TP1, TP2, or TP3)
  const column = `tp${tpLevel}_filled_qty`;
  const priceColumn = `tp${tpLevel}_filled_price`;
  const timeColumn = `tp${tpLevel}_filled_at`;

  const query = `
    UPDATE trades
    SET
      ${column} = $2,
      ${priceColumn} = $3,
      ${timeColumn} = NOW(),
      status = 'PARTIAL'
    WHERE id = $1
    RETURNING *;
  `;

  try {
    return await queryDatabase(env, query, [tradeId, quantity, price]);
  } catch (e) {
    console.error(`Failed to record TP${tpLevel}:`, e.message);
    return null;
  }
}

export async function getOpenTrades(env) {
  // Get all currently open trades
  const query = `
    SELECT * FROM trades
    WHERE status IN ('OPEN', 'PARTIAL')
    ORDER BY opened_at DESC;
  `;

  try {
    const result = await queryDatabase(env, query, []);
    return result.rows;
  } catch (e) {
    console.error('Failed to fetch open trades:', e.message);
    return [];
  }
}

export async function getDailyStats(env, date = new Date()) {
  // Get daily P&L and trade stats
  const dateStr = date.toISOString().split('T')[0];

  const query = `
    SELECT
      COUNT(*) as total_trades,
      SUM(CASE WHEN net_pnl_usdt > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN net_pnl_usdt < 0 THEN 1 ELSE 0 END) as losing_trades,
      ROUND(SUM(CASE WHEN net_pnl_usdt > 0 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as win_rate,
      SUM(net_pnl_usdt) as total_pnl,
      AVG(net_pnl_usdt) as avg_pnl,
      MAX(net_pnl_usdt) as largest_win,
      MIN(net_pnl_usdt) as largest_loss
    FROM trades
    WHERE DATE(opened_at) = $1 AND status = 'CLOSED';
  `;

  try {
    const result = await queryDatabase(env, query, [dateStr]);
    return result.rows[0];
  } catch (e) {
    console.error('Failed to fetch daily stats:', e.message);
    return null;
  }
}

// ── Internal: Generic database query helper ────────────────────────────────
async function queryDatabase(env, query, values) {
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');

  // Using postgres library via fetch or a connection pool
  // This example uses a simple HTTP API approach if you have a DB proxy
  // Otherwise, use a proper PostgreSQL client like pg or better-sqlite3

  // For now, return a mock response
  console.warn('Database query: ', query, values);
  return { rows: [] };
}

// Note: To fully implement, you'll need to:
// 1. Add DATABASE_URL to your wrangler.toml secrets
// 2. Use a PostgreSQL client or database proxy (e.g., Supabase, Neon, PgBouncer)
// 3. Or use Cloudflare D1 for SQLite (if not using PostgreSQL)
