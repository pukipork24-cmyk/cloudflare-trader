"""Technical Analysis Agent"""
from .base import BaseAgent
import json

class TechnicalAgent(BaseAgent):
    def __init__(self):
        super().__init__('technical')
        self.system_prompt = """You are a technical analysis expert. Analyze price charts, indicators (RSI, MACD, Bollinger Bands), support/resistance levels, and volume patterns.

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
        """Analyze technical indicators"""
        if mode == 'live':
            user_msg = f"""Current {data.get('symbol')} data:
Price: ${data.get('price')}
RSI: {data.get('rsi')}
MACD: {data.get('macd')}
Bollinger Band Position: {data.get('bb_pos')}%
24h High: ${data.get('high')}
24h Low: ${data.get('low')}
Volume: {data.get('volume')}

Provide technical analysis."""
        else:
            # Backtest mode - historical replay
            user_msg = f"Replay historical candle: {json.dumps(data)}"

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=30)
