# Safety & Anti-Overfitting Rules

## Strict Rules (Enforced)

### 1. Walk-Forward Validation
- Training window: 30 days
- Test window: 7 days (never overlapping)
- No lookahead bias allowed
- Validates actual edge, not curve fitting

### 2. Minimum Trade Sample
- At least 20 trades before evaluation
- Less than 20 = results not statistically significant
- System rejects backtest if N < 20

### 3. Sharpe Ratio Improvement
- Must improve by >5% to be considered real
- Less than 5% = just noise
- Prevents false positives from random variation

### 4. Circuit Breakers

#### Consecutive Losses
- 3 trades with >5% loss each
- Action: 6-hour trading pause
- Manual override required to resume

#### Max Drawdown
- Portfolio drawdown exceeds 15%
- Action: Halt all trading (24-hour pause minimum)
- Prevents cascading losses

### 5. Paper Trading Requirement
- All new strategies must paper trade 24 hours
- Real money only after validation
- Includes live order placement (no fill)

### 6. Code Safety
- Core files immutable:
  - `risk.py` (risk logic)
  - `bitget_client.py` (exchange interface)
  - `database.py` (schema)
- No write access for evolution system
- All changes logged with git history

### 7. Position Sizing
- Max 2% risk per trade
- Never risk more than allocated
- Position size = (Risk % × Balance) / Stop Loss Distance

### 8. Daily Loss Limit
- Stop trading if cumulative loss >10% of daily allocation
- Reset at midnight UTC
- Prevents worst days from destroying account

## Optional Tuning

Configurable (non-critical):
- Cycle interval (default: 5 minutes)
- Max concurrent trades (default: 3)
- Max leverage (default: 5x)
- Per-trade risk % (default: 2.0%)

## Monitoring

1. **Real-time**:
   - Check trading logs every hour
   - Monitor circuit breaker status
   - Watch Sharpe ratio drift

2. **Daily**:
   - Review P&L
   - Check drawdown
   - Verify API connections

3. **Weekly**:
   - Run backtest on last 7 days
   - Check overfitting metrics
   - Review agent consensus quality

## What Can't Happen

❌ **Circuit breaker can be disabled**
❌ **Walk-forward validation can be skipped**
❌ **Trades without stop-loss**
❌ **Real trading without 24h paper test**
❌ **Risk agent logic can be changed**
❌ **Position size >2% without CIO approval**
❌ **Backtest results<20 trades**
❌ **Hard-coded API keys in code**

## What Can Happen

✅ **Pause trading to analyze signals**
✅ **Adjust per-trade risk %**
✅ **Change cycle interval**
✅ **Improve agents (with validation)**
✅ **Add new data sources**
✅ **Tune technical indicators**
✅ **Manual trade adjustment**
✅ **Override CIO decision** (with reason logged)
