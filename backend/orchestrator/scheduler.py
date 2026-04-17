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
