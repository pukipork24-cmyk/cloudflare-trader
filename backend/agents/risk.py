"""Risk Management Agent (IMMUTABLE - core risk logic)"""
from .base import BaseAgent

class RiskAgent(BaseAgent):
    """Risk assessment and position sizing"""

    def __init__(self):
        super().__init__('risk')
        self.system_prompt = """You are a professional risk manager. Calculate safe position sizes, stop-loss levels, and portfolio exposure limits.

RULES:
- Max position size: Never exceed 2% risk of total portfolio
- Stop-loss placement: Based on recent volatility
- Portfolio exposure: Max 3 concurrent trades
- Leverage limits: Max 5x leverage
- Daily loss limit: Stop if cumulative loss > 10% of daily allocation

Return ONLY valid JSON:
{
  "recommendation": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "safe_position_size_pct": 0-2.0,
  "stop_loss_pct": 1-5,
  "max_portfolio_exposure": 0-100,
  "risk_level": "LOW"|"MEDIUM"|"HIGH"|"EXTREME",
  "position_concentration": "low"|"medium"|"high"
}"""

    async def analyze(self, data, mode='live'):
        """Calculate risk parameters"""
        if mode == 'live':
            user_msg = f"""Calculate risk for {data.get('symbol')}:
Current balance: ${data.get('balance')}
Volatility (24h range): ${data.get('price_low')} - ${data.get('price_high')}
Open positions: {data.get('open_positions')}
Daily loss so far: ${data.get('daily_loss')}
Recent trades: {data.get('recent_trades')}

Provide risk assessment."""
        else:
            user_msg = f"Risk data: {data}"

        result = await self.call_ai(user_msg)
        if not result:
            result = self.format_response('HOLD', confidence=50, safe_position_size_pct=2.0, stop_loss_pct=3)

        return result
