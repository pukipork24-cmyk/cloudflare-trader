# API Keys Setup Guide

## 1. Groq (Free AI Model)
1. Go to https://console.groq.com
2. Sign up (free)
3. Navigate to API Keys
4. Create new API key
5. Copy and set as `GROQ_API_KEY`

**Cost**: Free (unlimited requests)
**Setup time**: 5 minutes

## 2. Bitget Exchange
1. Go to https://www.bitget.com
2. Sign up and verify identity
3. Go to Account → API Management
4. Create new API key
5. Set permissions: Spot Trading (read/write)
6. Copy:
   - API Key → `BITGET_API_KEY`
   - Secret Key → `BITGET_SECRET_KEY`
   - Passphrase → `BITGET_PASSPHRASE`

**Important**: Enable IP whitelist for your server

**Cost**: Free (commission-based)
**Setup time**: 10 minutes

## 3. Whale Alert (Optional)
1. Go to https://whale-alert.io
2. Sign up (free tier: 1 API key, limited requests)
3. Copy API key → `WHALE_ALERT_API_KEY`

**Cost**: Free tier or $30/mo for pro
**Setup time**: 5 minutes

## 4. Etherscan (Free On-Chain Data)
1. Go to https://etherscan.io/apis
2. Sign up
3. Create API key
4. Copy → `ETHERSCAN_API_KEY`

**Cost**: Free
**Setup time**: 5 minutes

## 5. Telegram (Optional - For Alerts)
1. Go to https://my.telegram.org/apps
2. Create new app
3. Get API ID and API Hash
4. Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`
5. Your phone number → `TELEGRAM_PHONE`

**Cost**: Free
**Setup time**: 10 minutes

---

## Environment File

Create `.env` with all keys:
```bash
GROQ_API_KEY=gsk_your_key_here
BITGET_API_KEY=your_api_key
BITGET_SECRET_KEY=your_secret
BITGET_PASSPHRASE=your_pass
BITGET_SANDBOX=true  # Start in sandbox

WHALE_ALERT_API_KEY=your_key
ETHERSCAN_API_KEY=your_key

TRADING_ENABLED=false  # Don't trade yet
PAPER_TRADING_MODE=true  # Paper trading first
```

---

## Testing Setup

Run tests after setup:
```bash
python scripts/test_apis.py
```

This verifies all connections are working.
