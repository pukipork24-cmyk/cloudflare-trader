# A1 Migration Plan: Cloudflare Dashboard + Fly.io Python Backend

## Architecture
```
┌─────────────────────────────────────┐
│ Cloudflare Workers                  │
│ ├─ HTML Dashboard (current UI)      │
│ ├─ /api/* → proxy to Fly.io         │
│ └─ /api/login (still local auth)    │
└────────────────┬────────────────────┘
                 ↓ (HTTP API calls)
┌─────────────────────────────────────┐
│ Fly.io (Python Backend)             │
│ ├─ APScheduler (5-min trading cycle)│
│ ├─ 6 AI Agents (Groq)               │
│ ├─ Backtesting Engine               │
│ ├─ Redis pub/sub (agent messaging)  │
│ ├─ PostgreSQL (all data)            │
│ └─ API Endpoints                    │
│    ├─ /api/analyze                  │
│    ├─ /api/execute                  │
│    ├─ /api/backtest                 │
│    ├─ /api/intelligence-logs        │
│    └─ /api/trades                   │
└─────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Core Backend (Python)
- [ ] File structure
- [ ] Database models (SQLAlchemy)
- [ ] Redis connection
- [ ] Agent base classes
- [ ] Orchestrator
- [ ] API endpoints

### Phase 2: Agents with Backtest
- [ ] Technical agent (live + backtest modes)
- [ ] Sentiment agent
- [ ] Fundamental agent
- [ ] Risk agent
- [ ] Portfolio agent
- [ ] CIO gatekeeper

### Phase 3: Backtesting Engine
- [ ] Walk-forward validation
- [ ] Anti-overfitting checks
- [ ] Circuit breakers
- [ ] Performance metrics

### Phase 4: Deployment & Docs
- [ ] Docker setup
- [ ] Fly.io deploy
- [ ] .env template
- [ ] Complete documentation

## Current Cloudflare Changes
- Dashboard UI stays 100% the same
- Add Fly.io API proxy endpoints
- No database migration needed initially (PostgreSQL is new)

## Free Stack
- Hosting: Fly.io (free tier)
- AI: Groq (free tier)
- DB: PostgreSQL (Fly.io free)
- Cache: Redis (Fly.io free)
- Total Cost: $0/month
