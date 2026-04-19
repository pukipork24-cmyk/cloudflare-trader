"""Technical Analysis Agent"""
from .base import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)

class TechnicalAgent(BaseAgent):
    def __init__(self):
        from evolution.optimizer import optimizer
        super().__init__('technical')
        # Load optimized parameters from evolution system
        self.params = optimizer.get_params()
        logger.info(f"TechnicalAgent initialized with evolved parameters: RSI period={self.params['rsi_period']}, EMA fast={self.params['ema_fast']}")

        self.system_prompt = """You are a technical analysis expert. Analyze price charts, indicators (RSI, MACD, Bollinger Bands), support/resistance levels, and volume patterns.

Use the provided indicator thresholds and parameters to make optimal trading decisions.

Return ONLY valid JSON:
{
  "recommendation": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "rsi_signal": "overbought"|"oversold"|"neutral",
  "trend": "uptrend"|"downtrend"|"sideways",
  "entry_zone": "price range",
  "stop_loss": "price",
  "target": "price",
  "analysis": "brief summary"
}"""

    async def analyze(self, data, mode='live'):
        """Analyze technical indicators using evolved parameters"""
        # Reload parameters in case they were updated by evolution cycle
        self.params = optimizer.get_params()

        if mode == 'live':
            # Build analysis message with evolved parameters
            user_msg = f"""Current {data.get('symbol')} data:
Price: ${data.get('price')}
RSI: {data.get('rsi')} (Period: {self.params['rsi_period']}, Overbought: {self.params['rsi_overbought']}, Oversold: {self.params['rsi_oversold']})
MACD: {data.get('macd')} (Fast: {self.params['macd_fast']}, Slow: {self.params['macd_slow']}, Signal: {self.params['macd_signal']})
Bollinger Band Position: {data.get('bb_pos')}% (Period: {self.params['bb_period']}, Std Dev: {self.params['bb_std']})
EMA Fast: {self.params['ema_fast']} | EMA Mid: {self.params['ema_mid']} | EMA Slow: {self.params['ema_slow']} | EMA Long: {self.params['ema_long']}
24h High: ${data.get('high')}
24h Low: ${data.get('low')}
Volume: {data.get('volume')}

These are AI-optimized technical indicator parameters learned from backtesting. Use them to guide your analysis.
Provide technical analysis and trading recommendation."""
        else:
            # Backtest mode - historical replay with evolved parameters
            user_msg = f"""Analyze historical candle with evolved parameters:
{json.dumps(data)}

Indicator parameters:
- RSI Period: {self.params['rsi_period']}, Overbought: {self.params['rsi_overbought']}, Oversold: {self.params['rsi_oversold']}
- MACD Fast: {self.params['macd_fast']}, Slow: {self.params['macd_slow']}, Signal: {self.params['macd_signal']}
- Bollinger Bands Period: {self.params['bb_period']}, Std Dev: {self.params['bb_std']}

Provide technical analysis."""

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=30)
