"""Fundamental Analysis Agent"""
from .base import BaseAgent

class FundamentalAgent(BaseAgent):
    def __init__(self):
        super().__init__('fundamental')
        self.system_prompt = """You are a fundamental crypto analyst. Evaluate tokenomics, team quality, development activity, on-chain metrics, and long-term viability.

Return ONLY valid JSON:
{
  "recommendation": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "project_health": "strong"|"moderate"|"weak",
  "tokenomics_quality": "excellent"|"good"|"fair"|"poor",
  "team_activity": "very_active"|"active"|"inactive"|"abandoned",
  "on_chain_metric": "bullish"|"neutral"|"bearish",
  "long_term_viability": "high"|"medium"|"low",
  "key_factors": ["factor1", "factor2"]
}"""

    async def analyze(self, data, mode='live'):
        """Analyze fundamentals"""
        if mode == 'live':
            user_msg = f"""Analyze fundamentals for {data.get('symbol')}:
Project: {data.get('project')}
Tokenomics: {data.get('tokenomics')}
Team: {data.get('team')}
Development: {data.get('dev_activity')}
On-chain: {data.get('on_chain')}

Provide fundamental analysis."""
        else:
            user_msg = f"Fundamental data: {data}"

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=30)
