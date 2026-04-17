"""Sentiment Analysis Agent"""
from .base import BaseAgent

class SentimentAgent(BaseAgent):
    def __init__(self):
        super().__init__('sentiment')
        self.system_prompt = """You are a market sentiment analyst. Evaluate fear/greed, social media signals, news tone, and market mood.

Return ONLY valid JSON:
{
  "recommendation": "BUY"|"SELL"|"HOLD",
  "confidence": 0-100,
  "sentiment": "very_bullish"|"bullish"|"neutral"|"bearish"|"very_bearish",
  "fear_greed_index": 0-100,
  "social_signal": "strong_positive"|"positive"|"neutral"|"negative"|"strong_negative",
  "news_catalyst": "catalyst description or null",
  "risk_on_off": "risk_on"|"risk_off"
}"""

    async def analyze(self, data, mode='live'):
        """Analyze market sentiment"""
        if mode == 'live':
            user_msg = f"""Analyze sentiment for {data.get('symbol')}:
Recent news catalysts: {data.get('news')}
Social media signal: {data.get('social_sentiment')}
Fear/Greed indicator: {data.get('fear_greed')}
Market risk appetite: {data.get('market_mood')}

Provide sentiment analysis."""
        else:
            user_msg = f"Sentiment data: {data}"

        result = await self.call_ai(user_msg)
        return result or self.format_response('HOLD', confidence=30)
