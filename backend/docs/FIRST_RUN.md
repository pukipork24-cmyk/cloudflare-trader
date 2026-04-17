# First Run Guide - Deploy on Fly.io

## Prerequisites
- Git installed
- Fly CLI installed: `curl -L https://fly.io/install.sh | sh`
- All API keys ready (see API_KEYS_GUIDE.md)

## Step 1: Clone & Setup

```bash
git clone <your-repo> pukitradev2
cd pukitradev2/backend

# Create .env file
cp .env.example .env
# Edit .env with your API keys
nano .env
```

## Step 2: Local Testing

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database
python scripts/init_db.py

# Run app locally
python app.py
```

Visit `http://localhost:5000/health` - should return `{"status": "healthy"}`

## Step 3: Deploy to Fly.io

```bash
# Login to Fly
flyctl auth login

# Launch app (one-time setup)
flyctl launch --name pukitradev2 --region sjc

# Set secrets
flyctl secrets set GROQ_API_KEY=$GROQ_API_KEY
flyctl secrets set BITGET_API_KEY=$BITGET_API_KEY
# ... set all others

# Deploy
flyctl deploy
```

## Step 4: Verify Deployment

```bash
# Check logs
flyctl logs

# Test endpoint
curl https://pukitradev2.fly.dev/health
```

## Step 5: Paper Trading (24 hours)

Before enabling real trading, run in paper mode:

```bash
flyctl secrets set PAPER_TRADING_MODE=true
flyctl secrets set TRADING_ENABLED=false
```

Monitor for 24 hours:
- Check trade signals are reasonable
- Verify API connections work
- Monitor error logs

## Step 6: Enable Real Trading

Only after 24h paper trading:

```bash
flyctl secrets set PAPER_TRADING_MODE=false
flyctl secrets set TRADING_ENABLED=true
```

**⚠️ WARNING**: This is when REAL money trades. Double-check everything!

## Step 7: Monitor Live Trading

```bash
# Tail logs
flyctl logs -f

# Check app health
flyctl status

# View metrics
flyctl metrics
```

---

## Troubleshooting

### App won't start
```bash
flyctl logs  # Check error messages
```

### Database connection failing
```bash
flyctl postgres # Verify PostgreSQL is running
```

### Trading not executing
1. Check `TRADING_ENABLED=true`
2. Check `PAPER_TRADING_MODE=false`
3. Check Bitget API key is valid
4. Check circuit breaker isn't triggered

---

## Post-Deployment Checklist

- [ ] App is deployed and healthy
- [ ] Database migrations ran successfully
- [ ] All API keys configured
- [ ] Paper trading enabled
- [ ] Monitored 24 hours
- [ ] No errors in logs
- [ ] Trades executing correctly
- [ ] Ready for real trading
