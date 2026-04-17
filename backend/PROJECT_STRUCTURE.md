# Python Backend Project Structure

```
backend/
├── app.py                          # Flask app entry point
├── requirements.txt                # Dependencies
├── .env.example                    # Environment template
├── docker-compose.yml              # Container orchestration
├── Dockerfile                      # Python container
│
├── config/
│   ├── __init__.py
│   ├── settings.py                 # App configuration
│   └── security.py                 # Safety checker
│
├── models/
│   ├── __init__.py
│   ├── database.py                 # SQLAlchemy setup
│   ├── trade.py                    # Trade model
│   ├── decision.py                 # Trading decision model
│   ├── backtest_result.py           # Backtest results
│   └── user.py                     # User auth
│
├── agents/
│   ├── __init__.py
│   ├── base.py                     # Agent base class
│   ├── technical.py                # Technical agent
│   ├── sentiment.py                # Sentiment agent
│   ├── fundamental.py              # Fundamental agent
│   ├── risk.py                     # Risk agent (IMMUTABLE)
│   ├── portfolio.py                # Portfolio agent
│   └── cio.py                      # CIO gatekeeper
│
├── orchestrator/
│   ├── __init__.py
│   ├── main.py                     # Master orchestrator
│   ├── scheduler.py                # APScheduler setup
│   ├── executor.py                 # Trade execution
│   └── redis_broker.py             # Redis pub/sub
│
├── backtest/
│   ├── __init__.py
│   ├── engine.py                   # Backtest engine
│   ├── validator.py                # Walk-forward validator
│   ├── metrics.py                  # Performance metrics
│   └── anti_overfit.py             # Anti-overfitting rules
│
├── api/
│   ├── __init__.py
│   ├── routes.py                   # All endpoints
│   ├── auth.py                     # Authentication
│   └── errors.py                   # Error handling
│
├── services/
│   ├── __init__.py
│   ├── bitget_client.py            # Bitget API (IMMUTABLE)
│   ├── groq_client.py              # Groq AI client
│   ├── data_fetcher.py             # Market data
│   └── circuit_breaker.py          # Safety circuit breaker
│
├── scripts/
│   ├── generate_password_hash.py
│   ├── init_db.py
│   ├── test_apis.py
│   └── deploy.sh
│
└── docs/
    ├── API_KEYS_GUIDE.md
    ├── FIRST_RUN.md
    ├── ARCHITECTURE.md
    └── SAFETY_RULES.md

Total: ~40 files, 5000+ lines of code
```

## Key Design Decisions

### 1. Immutable Files (no evolution)
- `agents/risk.py` - Core risk logic
- `services/bitget_client.py` - Exchange interface
- `models/database.py` - Schema

### 2. Agent Modes (live + backtest)
All agents support:
```python
def analyze(self, data, mode='live'):
    if mode == 'live':
        # Analyze current market
    elif mode == 'backtest':
        # Replay historical data
```

### 3. Walk-Forward Validation
- Training window: 30 days
- Test window: 7 days
- No lookahead bias

### 4. Safety Rules
- Min 20 trades before evolution
- 5% Sharpe improvement threshold
- 3 consecutive -5% losses → 6h pause
- >15% portfolio drawdown → halt

### 5. API Endpoints (Cloudflare calls these)
```
POST   /api/analyze          → Multi-agent analysis
POST   /api/execute          → Place trade
POST   /api/backtest         → Run backtest
GET    /api/intelligence-logs → Get reports
GET    /api/trades           → Get trade history
GET    /api/balance          → Current balance
```

### 6. Redis Pub/Sub Pattern
```
Agent publishes: "technical-complete" → { result }
Orchestrator listens, aggregates, publishes: "ready-for-cio"
CIO publishes: "trade-approved" → { action }
Executor listens, executes trade
```

## Build Timeline

Phase 1 (Core): 2-3 hours
Phase 2 (Agents): 3-4 hours  
Phase 3 (Backtest): 2-3 hours
Phase 4 (Deploy): 1-2 hours

Total: ~8-12 hours to complete system

## Next Steps

1. Confirm you want full implementation
2. Start building Phase 1: Core backend + Flask app
3. Then agents with backtest mode
4. Then backtesting engine
5. Then deployment + docs

Ready to proceed?
