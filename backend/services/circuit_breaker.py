"""Circuit breaker - safety mechanism"""
from datetime import datetime, timedelta
from models.database import db, CircuitBreakerEvent
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class CircuitBreaker:
    """Prevents losses from cascading"""

    def __init__(self):
        self.pause_until = None

    def check_losses(self, recent_trades, daily_loss):
        """Check for consecutive losses"""
        if len(recent_trades) < Config.CIRCUIT_BREAKER_CONSECUTIVE_LOSSES:
            return True

        recent = recent_trades[-Config.CIRCUIT_BREAKER_CONSECUTIVE_LOSSES:]
        losses = [t for t in recent if t.get('pnl', 0) < -Config.CIRCUIT_BREAKER_LOSS_THRESHOLD_PCT]

        if len(losses) >= Config.CIRCUIT_BREAKER_CONSECUTIVE_LOSSES:
            self.trigger('consecutive_losses', f"{len(losses)} consecutive losses > {Config.CIRCUIT_BREAKER_LOSS_THRESHOLD_PCT}%")
            return False

        if daily_loss > Config.CIRCUIT_BREAKER_MAX_DRAWDOWN_PCT:
            self.trigger('max_drawdown', f"Daily loss {daily_loss}% > {Config.CIRCUIT_BREAKER_MAX_DRAWDOWN_PCT}%")
            return False

        return True

    def trigger(self, event_type, reason):
        """Activate circuit breaker"""
        pause_hours = Config.CIRCUIT_BREAKER_PAUSE_HOURS if event_type != 'max_drawdown' else 24

        self.pause_until = datetime.utcnow() + timedelta(hours=pause_hours)

        event = CircuitBreakerEvent(
            event_type=event_type,
            severity='halt' if event_type == 'max_drawdown' else 'pause',
            reason=reason,
            pause_until=self.pause_until
        )

        db.session.add(event)
        db.session.commit()

        logger.critical(f"🚨 CIRCUIT BREAKER TRIGGERED: {event_type} - {reason}")

    def is_paused(self):
        """Check if trading is paused"""
        if self.pause_until and datetime.utcnow() < self.pause_until:
            return True

        self.pause_until = None
        return False

circuit_breaker = CircuitBreaker()
