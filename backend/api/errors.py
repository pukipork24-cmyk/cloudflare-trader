"""Error handling"""

class TradingError(Exception):
    """Base trading exception"""
    pass

class InsufficientBalance(TradingError):
    """Not enough balance for trade"""
    pass

class CircuitBreakerTriggered(TradingError):
    """Circuit breaker activated"""
    pass

class BacktestValidationError(TradingError):
    """Backtest failed validation"""
    pass
