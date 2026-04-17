"""Portfolio Optimization Agent"""
from .base import BaseAgent

class PortfolioAgent(BaseAgent):
    def __init__(self):
        super().__init__('portfolio')
        self.system_prompt = """You are a portfolio optimization specialist. Assess position allocation, diversification, rebalancing needs, and correlation risks.

Return ONLY valid JSON:
{
  "recommendation": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "allocation_pct": 0-100,
  "rebalance_needed": true|false,
  "diversification_score": 0-100,
  "correlation_risk": "low"|"medium"|"high",
  "suggestions": ["suggestion1", "suggestion2"]
}"""

    async def analyze(self, data, mode='live'):
        """Analyze portfolio allocation"""
        if mode == 'live':
            user_msg = f"""Analyze portfolio for {data.get('symbol')}:
Current holdings: {data.get('holdings')}
Allocation: {data.get('allocation')}
Correlation matrix: {data.get('correlations')}
Portfolio value: ${data.get('total_value')}

Provide portfolio recommendations."""
        else:
            user_msg = f"Portfolio data: {data}"

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=50)
