"""Daily evolution scheduler for parameter optimization"""
from datetime import datetime, timedelta
from apscheduler.triggers.cron import CronTrigger
from .optimizer import optimizer
from backtest.engine import backtest_engine
from config.settings import Config
from agents import TechnicalAgent
import asyncio
import logging

logger = logging.getLogger(__name__)

class EvolutionScheduler:
    """Manages daily parameter evolution"""

    def __init__(self):
        self.last_evolution = None
        self.evolution_count = 0

    async def run_evolution_cycle(self):
        """Run one evolution cycle"""
        logger.info("=" * 60)
        logger.info("🧬 EVOLUTION CYCLE STARTED")
        logger.info("=" * 60)

        try:
            # Get current baseline (last 7 days backtest)
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=30)

            logger.info(f"Fetching baseline metrics for {start_date.date()} to {end_date.date()}")

            # Run baseline backtest with current params
            agents = [TechnicalAgent()]

            baseline_result = await backtest_engine.run_backtest(
                symbol='BTC',
                start_date=start_date,
                end_date=end_date,
                agents=agents,
                initial_balance=10000
            )

            if baseline_result.get('error'):
                logger.warning(f"Baseline backtest failed: {baseline_result['error']}")
                baseline_sharpe = 1.0
            else:
                baseline_sharpe = baseline_result.get('metrics', {}).get('sharpe_ratio', 1.0)
                logger.info(f"Baseline Sharpe ratio: {baseline_sharpe:.4f}")

            # Run evolution
            improved = await optimizer.evolve(
                backtest_results=baseline_result.get('metrics', {}),
                baseline_sharpe=baseline_sharpe
            )

            self.last_evolution = datetime.utcnow()
            self.evolution_count += 1

            logger.info("=" * 60)
            if improved:
                logger.info("✅ EVOLUTION CYCLE COMPLETE - PARAMETERS IMPROVED")
            else:
                logger.info("⚠️ EVOLUTION CYCLE COMPLETE - NO IMPROVEMENT")
            logger.info("=" * 60)

        except Exception as e:
            logger.error(f"Evolution cycle failed: {e}", exc_info=True)

    def get_status(self):
        """Get evolution status"""
        return {
            'last_evolution': self.last_evolution.isoformat() if self.last_evolution else None,
            'evolution_count': self.evolution_count,
            'current_params': optimizer.get_params(),
        }

evolution_scheduler = EvolutionScheduler()

def init_evolution_scheduler(app):
    """Initialize evolution scheduler in the app"""
    from orchestrator.scheduler import scheduler

    try:
        # Schedule daily evolution at 2 AM UTC
        scheduler.add_job(
            lambda: asyncio.run(evolution_scheduler.run_evolution_cycle()),
            CronTrigger(hour=2, minute=0),
            id='evolution_cycle',
            name='Daily parameter evolution',
            replace_existing=True
        )

        logger.info("✓ Evolution scheduler initialized (daily at 2 AM UTC)")

    except Exception as e:
        logger.error(f"Failed to init evolution scheduler: {e}")
