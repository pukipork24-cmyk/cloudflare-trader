# TIER 5: ORCHESTRATOR & DEPLOYMENT

## File: backend/orchestrator/__init__.py
```python
from .main import TradingOrchestrator
from .scheduler import init_scheduler
from .redis_broker import broker

__all__ = ['TradingOrchestrator', 'init_scheduler', 'broker']
```

## File: backend/orchestrator/redis_broker.py
```python
"""Redis pub/sub for agent communication"""
import redis
import json
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class RedisBroker:
    """Publish/subscribe message broker"""
    
    def __init__(self):
        try:
            self.redis = redis.from_url(Config.REDIS_URL)
            self.redis.ping()
            logger.info("✓ Redis connected")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            self.redis = None
    
    def publish(self, channel, data):
        """Publish message to channel"""
        if not self.redis:
            return False
        
        try:
            message = json.dumps(data) if isinstance(data, dict) else str(data)
            self.redis.publish(channel, message)
            logger.debug(f"Published to {channel}")
            return True
        except Exception as e:
            logger.error(f"Publish error: {e}")
            return False
    
    def subscribe(self, channels):
        """Subscribe to channels"""
        if not self.redis:
            return None
        
        try:
            pubsub = self.redis.pubsub()
            pubsub.subscribe(channels)
            logger.info(f"Subscribed to {channels}")
            return pubsub
        except Exception as e:
            logger.error(f"Subscribe error: {e}")
            return None
    
    def listen(self, pubsub):
        """Listen for messages"""
        if not pubsub:
            return
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data']) if isinstance(message['data'], bytes) else message['data']
                    yield data
                except Exception as e:
                    logger.error(f"Message parse error: {e}")

broker = RedisBroker()
```

## File: backend/orchestrator/main.py
```python
"""Master orchestrator - coordinates all agents"""
from datetime import datetime
from agents import *
from models.database import db, TradeDecision
from services.circuit_breaker import circuit_breaker
from config.settings import Config
import asyncio
import logging

logger = logging.getLogger(__name__)

class TradingOrchestrator:
    """Orchestrates 5-minute trading cycle"""
    
    def __init__(self):
        self.technical = TechnicalAgent()
        self.sentiment = SentimentAgent()
        self.fundamental = FundamentalAgent()
        self.risk = RiskAgent()
        self.portfolio = PortfolioAgent()
        self.intelligence = IntelligenceAgent()
        self.cio = CIOAgent()
    
    async def run_cycle(self, market_data):
        """Execute one complete 5-minute trading cycle"""
        logger.info(f"🚀 Starting trading cycle for {market_data.get('symbol')}")
        
        # Check circuit breaker
        if circuit_breaker.is_paused():
            logger.warning("⚠️ Circuit breaker active - skipping cycle")
            return None
        
        try:
            # Step 1: Run all agents in parallel
            logger.info("Step 1: Running agents...")
            
            results = await asyncio.gather(
                self.technical.analyze(market_data),
                self.sentiment.analyze(market_data),
                self.fundamental.analyze(market_data),
                self.risk.analyze(market_data),
                self.portfolio.analyze(market_data)
            )
            
            technical_result = results[0]
            sentiment_result = results[1]
            fundamental_result = results[2]
            risk_result = results[3]
            portfolio_result = results[4]
            
            logger.info(f"✓ Agents completed: Tech={technical_result.get('recommendation')}, "
                       f"Sentiment={sentiment_result.get('recommendation')}")
            
            # Step 2: Aggregate results
            logger.info("Step 2: Aggregating results...")
            
            aggregation = {
                'symbol': market_data.get('symbol'),
                'timestamp': datetime.utcnow().isoformat(),
                'technical_rec': technical_result.get('recommendation'),
                'technical_conf': technical_result.get('confidence'),
                'sentiment_rec': sentiment_result.get('recommendation'),
                'sentiment_conf': sentiment_result.get('confidence'),
                'fundamental_rec': fundamental_result.get('recommendation'),
                'fundamental_conf': fundamental_result.get('confidence'),
                'risk_rec': risk_result.get('recommendation'),
                'risk_conf': risk_result.get('confidence'),
                'portfolio_rec': portfolio_result.get('recommendation'),
                'portfolio_conf': portfolio_result.get('confidence'),
                'entry_zone': technical_result.get('entry_zone'),
                'stop_loss': risk_result.get('stop_loss'),
                'target': technical_result.get('target'),
                'timeframe': market_data.get('timeframe', '24-48h')
            }
            
            # Calculate consensus recommendation
            recommendations = [
                technical_result.get('recommendation'),
                sentiment_result.get('recommendation'),
                fundamental_result.get('recommendation'),
                risk_result.get('recommendation'),
                portfolio_result.get('recommendation')
            ]
            
            buy_votes = recommendations.count('BUY')
            sell_votes = recommendations.count('SELL')
            
            if buy_votes > sell_votes:
                aggregation['recommendation'] = 'BUY'
                aggregation['confidence'] = (buy_votes / 5) * 100
            elif sell_votes > buy_votes:
                aggregation['recommendation'] = 'SELL'
                aggregation['confidence'] = (sell_votes / 5) * 100
            else:
                aggregation['recommendation'] = 'HOLD'
                aggregation['confidence'] = 50
            
            aggregation['risk_level'] = risk_result.get('risk_level', 'MEDIUM')
            
            logger.info(f"✓ Aggregated: {aggregation['recommendation']} @ {aggregation['confidence']}%")
            
            # Step 3: Get intelligence analysis
            logger.info("Step 3: Intelligence analysis...")
            
            intelligence_result = await self.intelligence.analyze(aggregation)
            aggregation['intelligence_brief'] = intelligence_result
            
            logger.info(f"✓ Intelligence: {intelligence_result.get('narrative', 'N/A')[:50]}...")
            
            # Step 4: CIO approval
            logger.info("Step 4: CIO approval gate...")
            
            cio_result = await self.cio.analyze(aggregation)
            aggregation['cio_decision'] = cio_result.get('decision', 'SKIP')
            aggregation['cio_reasoning'] = cio_result.get('reasoning')
            
            if aggregation['cio_decision'] == 'EXECUTE':
                logger.info(f"✓ CIO APPROVED: {aggregation['cio_reasoning']}")
            else:
                logger.warning(f"⚠️ CIO REJECTED: {aggregation['cio_reasoning']}")
            
            # Step 5: Store decision
            logger.info("Step 5: Storing decision...")
            
            decision = TradeDecision(
                symbol=aggregation['symbol'],
                recommendation=aggregation['recommendation'],
                confidence=int(aggregation['confidence']),
                risk_level=aggregation['risk_level'],
                technical_rec=technical_result.get('recommendation'),
                technical_conf=technical_result.get('confidence'),
                sentiment_rec=sentiment_result.get('recommendation'),
                sentiment_conf=sentiment_result.get('confidence'),
                fundamental_rec=fundamental_result.get('recommendation'),
                fundamental_conf=fundamental_result.get('confidence'),
                risk_rec=risk_result.get('recommendation'),
                risk_conf=risk_result.get('confidence'),
                portfolio_rec=portfolio_result.get('recommendation'),
                portfolio_conf=portfolio_result.get('confidence'),
                intelligence_narrative=intelligence_result.get('narrative'),
                consensus_quality=intelligence_result.get('consensus_quality'),
                red_flags=intelligence_result.get('red_flags'),
                conflicts=intelligence_result.get('conflicts'),
                cio_decision=aggregation['cio_decision'],
                cio_reasoning=aggregation['cio_reasoning'],
                entry_zone=aggregation['entry_zone'],
                stop_loss=aggregation['stop_loss'],
                target=aggregation['target'],
                timeframe=aggregation['timeframe']
            )
            
            db.session.add(decision)
            db.session.commit()
            
            logger.info(f"✓ Decision stored (ID: {decision.id})")
            
            return aggregation
        
        except Exception as e:
            logger.error(f"❌ Cycle error: {e}", exc_info=True)
            return None

orchestrator = TradingOrchestrator()
```

## File: backend/orchestrator/scheduler.py
```python
"""APScheduler setup for 5-minute cycle"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from .main import orchestrator
import asyncio
import logging

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def trading_cycle_job():
    """5-minute trading cycle job"""
    try:
        # Fetch current market data
        market_data = {
            'symbol': 'BTC',
            'price': 43250,  # TODO: Fetch from API
            'rsi': 50,
            'macd': 0,
            'bb_pos': 50,
            'high': 44000,
            'low': 42500,
            'volume': 30000,
            'balance': 10000,
            'open_positions': 0,
            'daily_loss': 0,
            'timeframe': '5m'
        }
        
        # Run orchestrator
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(orchestrator.run_cycle(market_data))
        loop.close()
        
        if result:
            logger.info(f"✓ Cycle completed: {result.get('recommendation')}")
        else:
            logger.warning("Cycle failed")
    
    except Exception as e:
        logger.error(f"Job error: {e}")

def init_scheduler(app):
    """Initialize APScheduler"""
    from config.settings import Config
    
    try:
        # Schedule 5-minute cycle
        scheduler.add_job(
            trading_cycle_job,
            CronTrigger(minute='*/5'),  # Every 5 minutes
            id='trading_cycle',
            name='5-minute trading cycle',
            replace_existing=True
        )
        
        scheduler.start()
        logger.info(f"✓ Scheduler started (interval: {Config.CYCLE_INTERVAL_MINUTES} minutes)")
    
    except Exception as e:
        logger.error(f"Scheduler init failed: {e}")
```

## File: backend/Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code
COPY . .

# Run app
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:create_app()"]
```

## File: backend/docker-compose.yml
```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: trader
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: tradingbot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trader"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Python Backend
  app:
    build: .
    environment:
      FLASK_ENV: production
      DATABASE_URL: postgresql://trader:${DB_PASSWORD}@postgres:5432/tradingbot
      REDIS_URL: redis://redis:6379
      GROQ_API_KEY: ${GROQ_API_KEY}
      BITGET_API_KEY: ${BITGET_API_KEY}
      BITGET_SECRET_KEY: ${BITGET_SECRET_KEY}
      BITGET_PASSPHRASE: ${BITGET_PASSPHRASE}
      BITGET_SANDBOX: ${BITGET_SANDBOX}
      TRADING_ENABLED: ${TRADING_ENABLED}
      PAPER_TRADING_MODE: ${PAPER_TRADING_MODE}
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

## File: backend/.env.example
```bash
# ===== EXCHANGE =====
BITGET_API_KEY=your_api_key
BITGET_SECRET_KEY=your_secret_key
BITGET_PASSPHRASE=your_passphrase
BITGET_SANDBOX=true

# ===== AI SERVICES =====
GROQ_API_KEY=your_groq_api_key

# ===== DATA SOURCES =====
WHALE_ALERT_API_KEY=your_whale_alert_key
ETHERSCAN_API_KEY=your_etherscan_key
TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash
TELEGRAM_PHONE=your_phone_number

# ===== DATABASE =====
DATABASE_URL=postgresql://trader:password@postgres:5432/tradingbot
REDIS_URL=redis://redis:6379

# ===== AUTH =====
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=your_hashed_password
SECRET_KEY=your_secret_key_here

# ===== TRADING DEFAULTS =====
DEFAULT_MAX_CONCURRENT_TRADES=3
DEFAULT_PER_TRADE_RISK_PCT=2.0
DEFAULT_MAX_LEVERAGE=5
DEFAULT_MAX_PAIRS=10
CYCLE_INTERVAL_MINUTES=5

# ===== SAFETY =====
TRADING_ENABLED=false
PAPER_TRADING_MODE=true
```

## File: backend/scripts/deploy.sh
```bash
#!/bin/bash

# Deployment script for Fly.io

set -e

echo "🚀 Deploying Trading Bot to Fly.io"

# Check OS
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script requires Ubuntu/Linux"
    exit 1
fi

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# Install Fly CLI
if ! command -v flyctl &> /dev/null; then
    echo "📦 Installing Fly CLI..."
    curl -L https://fly.io/install.sh | sh
fi

# Create fly.toml
echo "📝 Creating fly.toml..."
cat > fly.toml << 'EOF'
app = "pukitradev2"
primary_region = "sjc"

[build]
  image = "python:3.11"
  
[env]
  PYTHONUNBUFFERED = "true"

[[services]]
  internal_port = 5000
  processes = ["app"]
  
  [services.tcp_checks]
    enabled = true
    grace_period = "5s"
    interval = "15s"
    timeout = "2s"
EOF

# Initialize Fly app
echo "🔐 Authenticating with Fly..."
flyctl auth login

# Create app
echo "📦 Creating Fly app..."
flyctl launch --name pukitradev2 --region sjc --no-deploy

# Set secrets
echo "🔑 Setting secrets..."
flyctl secrets set GROQ_API_KEY=$GROQ_API_KEY
flyctl secrets set BITGET_API_KEY=$BITGET_API_KEY
flyctl secrets set BITGET_SECRET_KEY=$BITGET_SECRET_KEY
flyctl secrets set BITGET_PASSPHRASE=$BITGET_PASSPHRASE
flyctl secrets set DATABASE_URL=$DATABASE_URL
flyctl secrets set REDIS_URL=$REDIS_URL

# Deploy
echo "🚀 Deploying..."
flyctl deploy

echo "✅ Deployment complete!"
echo "🌐 App URL: https://pukitradev2.fly.dev"
echo "📊 Dashboard: https://yourcloudflaredomain.com"
```

## File: backend/scripts/init_db.py
```python
"""Initialize database with seed data"""
from app import create_app
from models.database import db, User
import hashlib

app = create_app('production')

with app.app_context():
    db.drop_all()
    db.create_all()
    
    # Create admin user
    from config.settings import Config
    
    password_hash = hashlib.sha256(Config.ADMIN_EMAIL.encode()).hexdigest()
    
    admin = User(
        email=Config.ADMIN_EMAIL,
        password_hash=password_hash,
        is_active=True
    )
    
    db.session.add(admin)
    db.session.commit()
    
    print(f"✓ Database initialized")
    print(f"✓ Admin user created: {Config.ADMIN_EMAIL}")
```

---

## Summary: Tier 5
✅ Orchestrator - Master coordinator
✅ Scheduler - APScheduler (5-minute cycle)
✅ Redis Broker - Pub/sub messaging
✅ Docker - Container setup
✅ Deployment Script - Fly.io setup

**Next: Tier 6 (Complete Documentation)**
