Read PROMPT.md file and build everything described in it. Start with the file structure first.
---

# AI Trading Bot System — Full Build Instructions

## Project Overview
Build a complete, production-ready AI trading bot system with a web dashboard that can be deployed on Digital Ocean (2GB Droplet recommended, minimum 1GB). The system uses multiple specialized AI agents that collaborate to make cryptocurrency trading decisions on Bitget exchange.

## Tech Stack
- Backend AI agents: Python 3.11+
- Web frontend + API: Node.js (Next.js 14 with App Router)
- Database: PostgreSQL (via Docker)
- Cache/Queue: Redis
- Orchestration: Docker Compose
- Authentication: NextAuth.js (single-user, email+password)
- Reverse proxy: Nginx

## System Architecture

### 7 AI Agents

**AI1 — Technical Analysis Agent (Python)**
- Runs every 5 minutes
- Fetches OHLCV data from Bitget for: BTC/USDT, ETH/USDT, and top 20 coins by market cap
- Calculates these indicators using pandas-ta:
  - Trend: EMA(9,21,50,200), MACD, ADX
  - Momentum: RSI(14), Stochastic RSI, CCI
  - Volatility: Bollinger Bands, ATR, Keltner Channels
  - Volume: OBV, VWAP, Volume Profile
  - Patterns: Detects candlestick patterns, support/resistance levels
  - Multi-timeframe: Analyze 1m, 5m, 15m, 1h, 4h simultaneously
- Output: JSON report with signals, confidence scores, entry/exit zones per coin
- Self-evolution: Every 24h, run walk-forward optimization on indicator parameters using last 30 days data, validate on most recent 7 days (never seen data). Save new params only if Sharpe ratio improves by >5%.

**AI2 — Telegram News Agent (Python)**
- Runs every 5 minutes
- Monitors these Telegram channels (use Telethon library):
  - @WhaleCryptoAlert, @CryptoNewsFlash, @CoinDesk, @Cointelegraph, @binance_announcements, @bybit_announcements
- Extracts: coin mentions, sentiment (positive/negative/neutral), urgency score 1-10
- Filters: only news from last 10 minutes
- Output: JSON report with news items, affected coins, sentiment scores

**AI3 — Whale Wallet Tracker (Python)**
- Runs every 5 minutes
- Data sources:
  - Whale Alert API (free tier: https://api.whale-alert.io/v1/transactions)
  - Bitget large order detection via WebSocket (orders > $100k USD)
  - On-chain data via Etherscan API for ETH wallets
- Tracks: Large transfers >$500k, exchange inflows/outflows, wallet accumulation patterns
- Output: JSON report with whale movements, direction (buy pressure/sell pressure), affected coins

**AI4 — Aggregator + DeepSeek Consultant (Python)**
- Runs every 5 minutes, after AI1+2+3 complete
- Collects reports from AI1, AI2, AI3
- Builds a structured prompt summarizing all signals
- Calls DeepSeek API (model: deepseek-chat) with this system prompt: