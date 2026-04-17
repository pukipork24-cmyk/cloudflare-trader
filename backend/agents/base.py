"""Base agent class"""
from abc import ABC, abstractmethod
from services.groq_client import groq
import json
import logging

logger = logging.getLogger(__name__)

class BaseAgent(ABC):
    """Base class for all trading agents"""

    def __init__(self, name):
        self.name = name
        self.system_prompt = ""

    @abstractmethod
    async def analyze(self, data, mode='live'):
        """Analyze market data (live or backtest mode)"""
        pass

    async def call_ai(self, user_message):
        """Call Groq AI"""
        response = await groq.analyze(self.system_prompt, user_message)
        if response:
            return groq.parse_json_response(response)
        return None

    def format_response(self, recommendation, confidence=50, **kwargs):
        """Format agent response"""
        return {
            'agent': self.name,
            'recommendation': recommendation,
            'confidence': confidence,
            **kwargs
        }
