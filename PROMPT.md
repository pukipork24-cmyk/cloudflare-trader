Read PROMPT.md file and build everything described in it. Start with the file structure first.
---

## Environment Variables (.env.example)

```bash
# ===== EXCHANGE =====
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=
BITGET_SANDBOX=false  # set true for testing

# ===== AI SERVICES =====
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
ANTHROPIC_API_KEY=

# ===== DATA SOURCES =====
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
WHALE_ALERT_API_KEY=
ETHERSCAN_API_KEY=
BSCSCAN_API_KEY=

# ===== DATABASE =====
DATABASE_URL=postgresql://trader:CHANGE_ME@postgres:5432/tradingbot
REDIS_URL=redis://redis:6379

# ===== AUTH (single user) =====
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=  # run: python scripts/generate_password_hash.py

# ===== NEXTAUTH =====
NEXTAUTH_SECRET=  # run: openssl rand -base64 32
NEXTAUTH_URL=https://yourdomain.com

# ===== TRADING DEFAULTS =====
DEFAULT_MAX_CONCURRENT_TRADES=3
DEFAULT_PER_TRADE_RISK_PCT=2.0
DEFAULT_MAX_LEVERAGE=5
DEFAULT_MAX_PAIRS=10
CYCLE_INTERVAL_MINUTES=5

# ===== SAFETY =====
TRADING_ENABLED=false  # must manually set to true after verification
PAPER_TRADING_MODE=true  # set false for real trading
```

---

## Safety & Anti-Overfitting Rules (implement strictly)

1. Walk-forward validation: training window 30d, test window 7d (strictly no leakage)
2. Minimum trade sample: 20 trades before any evolution
3. Improvement threshold: Sharpe ratio must improve by >5% (not just noise)
4. Code changes: must pass safety_checker.py (scans for forbidden file imports, API key access, network calls to unknown hosts)
5. Sandbox period: 24h paper trading before code structure changes approved
6. Human-in-the-loop: code structure changes always require user approval click
7. Parameter changes: auto-applied if backtest passes, but logged and reversible
8. Circuit breakers: 3 consecutive losses >5% each → 6h pause; portfolio drawdown >15% → full halt
9. Immutable files: bitget_client.py, ai5_risk.py execution logic, auth files — evolution system has no write access
10. Git history: every change committed with descriptive message, easy rollback via dashboard

---

## Deployment Script (scripts/deploy.sh)

The script must:
1. Detect Ubuntu 22.04, exit if wrong OS
2. Install: docker, docker-compose, git, certbot
3. Prompt interactively for all required env vars (with instructions for each)
4. Generate secure NEXTAUTH_SECRET and prompt for password to hash
5. Write .env file
6. Run: docker-compose pull && docker-compose up -d
7. Wait for PostgreSQL to be ready, then run init_db.sql
8. Run Telegram first-time auth (interactive)
9. Print: access URL, login credentials reminder, "set TRADING_ENABLED=true when ready"
10. Print checklist of manual steps remaining (SSL cert, Telegram verification, API key testing)

---

## Post-Build Deliverables Required

After building all code, provide:
1. Complete annotated file tree
2. docs/API_KEYS_GUIDE.md — step by step for every external API
3. docs/FIRST_RUN.md — exact commands to deploy on fresh Digital Ocean droplet
4. docs/ARCHITECTURE.md — how agents communicate, data flow diagram in text
5. Explanation of how to safely transition from paper trading to real trading
6. Recommended Digital Ocean droplet size and estimated monthly cost breakdown