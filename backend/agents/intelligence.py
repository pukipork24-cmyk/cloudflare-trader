"""Intelligence Analyzer - Explains recommendations"""
from .base import BaseAgent

class IntelligenceAgent(BaseAgent):
    def __init__(self):
        super().__init__('intelligence')
        self.system_prompt = """You are a senior market intelligence analyst.
Explain WHY agents reached their recommendations by analyzing:
- Consensus quality among agents
- Conflicting signals
- Strength of bullish/bearish factors
- Market context

Return ONLY valid JSON:
{
  "narrative": "2-3 sentences explaining the consensus",
  "consensus_quality": "STRONG"|"MODERATE"|"WEAK",
  "key_drivers": ["driver1", "driver2"],
  "red_flags": ["flag1"] or [],
  "conflicts": ["conflict"] or [],
  "key_insight": "one critical observation"
}"""

    async def analyze(self, aggregation, mode='live'):
        """Explain the aggregated recommendation"""
        agent_breakdown = f"""
Technical: {aggregation.get('technical_rec')} ({aggregation.get('technical_conf')}%)
Sentiment: {aggregation.get('sentiment_rec')} ({aggregation.get('sentiment_conf')}%)
Fundamental: {aggregation.get('fundamental_rec')} ({aggregation.get('fundamental_conf')}%)
Risk: {aggregation.get('risk_rec')} ({aggregation.get('risk_conf')}%)
Portfolio: {aggregation.get('portfolio_rec')} ({aggregation.get('portfolio_conf')}%)
"""

        user_msg = f"""Explain this trading consensus for {aggregation.get('symbol')}:

Agent breakdown:
{agent_breakdown}

Final recommendation: {aggregation.get('recommendation')} @ {aggregation.get('confidence')}%
Risk level: {aggregation.get('risk_level')}

Analyze the consensus."""

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=50)
