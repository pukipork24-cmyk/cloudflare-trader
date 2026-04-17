# System Architecture

## Overview

```
┌─────────────────────────────────────┐
│ Cloudflare Workers (Dashboard UI)   │
│ ├─ HTML Interface                   │
│ ├─ WebSocket for live updates       │
│ └─ API proxy: /api/* → Fly.io       │
└────────────────────┬────────────────┘
                     │ HTTP API calls
                     ↓
┌─────────────────────────────────────┐
│ Fly.io (Python Backend)             │
│                                     │
│ ┌─ APScheduler (5-min cycle) ──┐   │
│ │                               │   │
│ │ TradingOrchestrator:          │   │
│ │ ├─ 6 AI Agents (parallel)    │   │
│ │ ├─ Aggregation               │   │
│ │ ├─ CIO Gatekeeper            │   │
│ │ └─ Execution                 │   │
│ │                               │   │
│ │ ↓ (Redis pub/sub)            │   │
│ │                               │   │
│ │ ├─ Technical Agent           │   │
│ │ ├─ Sentiment Agent           │   │
│ │ ├─ Fundamental Agent         │   │
│ │ ├─ Risk Agent (IMMUTABLE)    │   │
│ │ ├─ Portfolio Agent           │   │
│ │ ├─ Intelligence Agent        │   │
│ │ └─ CIO Agent                 │   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ ┌─ Flask API Server ──────────────┐ │
│ │ /api/analyze                    │ │
│ │ /api/execute                    │ │
│ │ /api/backtest                   │ │
│ │ /api/intelligence-logs          │ │
│ │ /api/trades                     │ │
│ │ /api/balance                    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Services ──────────────────────┐ │
│ │ ├─ Bitget API (exchange)        │ │
│ │ ├─ Groq AI (LLMs)              │ │
│ │ ├─ Circuit Breaker (safety)    │ │
│ │ ├─ Whale Alert (monitoring)    │ │
│ │ └─ Telegram (alerts)            │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ PostgreSQL (Database) ─────────┐ │
│ │ ├─ Trades                       │ │
│ │ ├─ Decisions                    │ │
│ │ ├─ Backtest Results             │ │
│ │ └─ Circuit Breaker Events       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Redis (Cache & Pub/Sub) ──────┐ │
│ │ ├─ Agent messaging              │ │
│ │ ├─ Session cache                │ │
│ │ └─ Rate limit tracking          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
                │ Spot Trading
                ↓
        ┌───────────────┐
        │ Bitget API    │
        │ (Paper Mode)  │
        └───────────────┘
```

## 5-Minute Cycle

1. **APScheduler** triggers at :00, :05, :10, :15...
2. **TradingOrchestrator.run_cycle()** starts
3. **All 6 agents run in parallel** (via asyncio)
4. **Results aggregated** (weighted voting)
5. **Intelligence agent explains** consensus
6. **CIO agent approves/rejects**
7. **If EXECUTE:** Trade executed via Bitget API
8. **All decisions stored** in PostgreSQL
9. **Cycle completes** (typically 5-30 seconds)

## Agent Communication

Agents don't call each other. Instead:

```
Orchestrator
├─ Publishes: "analyze" → [market_data]
├─ All agents listen, run independently
├─ Each publishes: "agent-complete" → {result}
├─ Orchestrator collects all results
└─ Proceeds to aggregation
```

This prevents:
- Circular dependencies
- Blocking calls
- Coupled logic

## Data Flow

```
Market Data (from Cloudflare)
    ↓
Orchestrator (coordinator)
    ├─→ Technical Agent → analysis
    ├─→ Sentiment Agent → analysis
    ├─→ Fundamental Agent → analysis
    ├─→ Risk Agent → analysis (IMMUTABLE)
    └─→ Portfolio Agent → analysis
    ↓
Aggregation (weighted voting)
    ↓
Intelligence Agent (explanation)
    ↓
CIO Agent (approval gate)
    ↓
Execution (if EXECUTE)
    ├─→ Bitget API (place order)
    ├─→ Circuit Breaker (safety check)
    └─→ PostgreSQL (log trade)
    ↓
WebSocket to Cloudflare (update UI)
```

## Safety Mechanisms

1. **Circuit Breaker**: 3 consecutive -5% losses → 6h pause
2. **Max Drawdown**: >15% portfolio loss → full halt
3. **Walk-Forward Validation**: 30d train, 7d test (no lookahead)
4. **Anti-Overfitting**: Sharpe ratio must improve >5%
5. **Paper Trading Mode**: Test 24h before real trading
6. **CIO Gatekeeper**: Human-in-the-loop final approval
7. **Risk Agent (IMMUTABLE)**: Can't be changed by evolution
8. **Bitget Sandbox**: Test orders before real execution

## Scaling

Current setup handles:
- 1 symbol at a time
- ~100 concurrent trades
- 5-minute cycle

To scale:
- Add more AI provider capacity (Groq quota)
- Use Fly.io autoscaling
- Add PostgreSQL read replicas
- Implement sharding for multiple symbols

Cost remains **$0** because:
- Fly.io free tier covers 3 VMs (Python + Redis + enough for small scale)
- Groq free tier for AI
- PostgreSQL free on Fly.io
