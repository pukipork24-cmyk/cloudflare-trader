"""Chief Investment Officer (CIO) Agent - Final Approval Gate"""
from .base import BaseAgent

class CIOAgent(BaseAgent):
    """CIO gatekeeper for trade execution"""

    def __init__(self):
        super().__init__('cio')
        self.system_prompt = """You are a Chief Investment Officer reviewing a trade proposal.
Approve, reject, or request modifications based on:
- Consensus among specialist agents
- Risk/reward ratio
- Current market conditions
- Portfolio health

Be CONSERVATIVE: When in doubt, SKIP the trade.

Return ONLY valid JSON:
{
  "decision": "EXECUTE"|"SKIP"|"MODIFY",
  "reasoning": "one sentence",
  "modified_params": {} or null,
  "risk_override": false
}"""

    async def analyze(self, aggregation, mode='live'):
        """Make final trade approval decision"""
        user_msg = f"""Review this trade proposal:

Recommendation: {aggregation.get('recommendation')}
Confidence: {aggregation.get('confidence')}%
Risk Level: {aggregation.get('risk_level')}

Agent votes:
- Technical: {aggregation.get('technical_rec')} ({aggregation.get('technical_conf')}%)
- Sentiment: {aggregation.get('sentiment_rec')} ({aggregation.get('sentiment_conf')}%)
- Fundamental: {aggregation.get('fundamental_rec')} ({aggregation.get('fundamental_conf')}%)
- Risk: {aggregation.get('risk_rec')} ({aggregation.get('risk_conf')}%)
- Portfolio: {aggregation.get('portfolio_rec')} ({aggregation.get('portfolio_conf')}%)

Trade Parameters:
- Entry: {aggregation.get('entry_zone')}
- Stop Loss: {aggregation.get('stop_loss')}
- Target: {aggregation.get('target')}

Approve, reject, or modify?"""

        result = await self.call_ai(user_msg)
        return result or self.format_response('SKIP', confidence=100, decision='SKIP', reasoning='Insufficient data')
