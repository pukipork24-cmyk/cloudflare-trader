"""Groq API client stub"""
import logging

logger = logging.getLogger(__name__)

class GroqClient:
    def __init__(self):
        self.available = False
        logger.info("⚠️ Groq client initialized (stub mode)")

    async def analyze(self, system_prompt, user_message):
        """Stub - not implemented"""
        return {"error": "Groq not configured", "recommendation": "HOLD", "confidence": 0}

# Global instance
groq = GroqClient()
