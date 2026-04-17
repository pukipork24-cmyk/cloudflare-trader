# Complete Python Backend Codebase (50+ Files)

## How to Use This Document
This is a **master reference** with ALL code needed. Copy each section into its respective file.

---

## TIER 1: CORE INFRASTRUCTURE

### File: backend/config/__init__.py
```python
# Empty file to make config a package
```

### File: backend/models/__init__.py
```python
from .database import db, User, TradeDecision, Trade, BacktestResult, CircuitBreakerEvent, init_db

__all__ = ['db', 'User', 'TradeDecision', 'Trade', 'BacktestResult', 'CircuitBreakerEvent', 'init_db']
```

### File: backend/config/security.py
```python
"""Safety checker for code changes"""
import os
import re

FORBIDDEN_IMPORTS = [
    'requests',  # External API calls (except approved)
    'subprocess',
    'eval',
    'exec',
    '__import__'
]

FORBIDDEN_FILES = {
    'bitget_client.py',
    'risk.py',  # risk agent
    'database.py'
}

class SafetyChecker:
    @staticmethod
    def check_code_change(file_path, content):
        """Check if code change is safe"""
        errors = []
        
        # Check forbidden imports
        for forbidden in FORBIDDEN_IMPORTS:
            if f'import {forbidden}' in content or f'from {forbidden}' in content:
                errors.append(f"Forbidden import: {forbidden}")
        
        # Check for hard-coded API keys
        if re.search(r'(sk_|pk_|api_key\s*=\s*["\'][^"\']{20,}["\'])', content):
            errors.append("Hard-coded credentials detected")
        
        # Check for network calls to unknown hosts
        if re.search(r'requests\.(?:get|post|put|delete)\(["\']http', content):
            errors.append("Unapproved network call")
        
        return {'safe': len(errors) == 0, 'errors': errors}

safety = SafetyChecker()
```

### File: backend/services/__init__.py
```python
from .groq_client import groq
from .bitget_client import BitgetClient
from .circuit_breaker import CircuitBreaker
from .telegram_client import TelegramClient
from .whale_alert_client import WhaleAlertClient

__all__ = ['groq', 'BitgetClient', 'CircuitBreaker', 'TelegramClient', 'WhaleAlertClient']
```

### File: backend/services/groq_client.py
```python
"""Groq AI client for agent analysis"""
from groq import Groq
from config.settings import Config
import json
import re
import logging

logger = logging.getLogger(__name__)

class GroqClient:
    def __init__(self):
        self.client = Groq(api_key=Config.GROQ_API_KEY)
        self.model = Config.GROQ_MODEL
    
    async def analyze(self, system_prompt, user_message, temperature=0.3):
        """Call Groq API for analysis"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=temperature,
                max_tokens=1024,
                top_p=0.9
            )
            
            result = response.choices[0].message.content
            logger.info(f"✓ Groq analysis completed")
            return result
        except Exception as e:
            logger.error(f"✗ Groq error: {e}")
            return None
    
    def parse_json_response(self, response_text):
        """Extract and parse JSON from response"""
        if not response_text:
            return None
        
        try:
            # Find JSON object in response
            match = re.search(r'\{[\s\S]*\}', response_text)
            if match:
                json_str = match.group()
                return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON: {e}")
        
        return None

groq = GroqClient()
```

### File: backend/services/bitget_client.py
```python
"""Bitget API client (IMMUTABLE - core exchange logic)"""
import hashlib
import hmac
import json
import time
from datetime import datetime
import requests
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class BitgetClient:
    """Bitget exchange API wrapper"""
    
    BASE_URL = 'https://api.bitget.com' if not Config.BITGET_SANDBOX else 'https://api.bitget.com'
    
    def __init__(self):
        self.api_key = Config.BITGET_API_KEY
        self.secret_key = Config.BITGET_SECRET_KEY
        self.passphrase = Config.BITGET_PASSPHRASE
        self.sandbox = Config.BITGET_SANDBOX
    
    def _sign(self, method, request_path, body=''):
        """Generate HMAC signature"""
        timestamp = str(int(time.time() * 1000))
        message = timestamp + method.upper() + request_path + (body or '')
        
        signature = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()
        
        import base64
        return base64.b64encode(signature).decode()
    
    def _request(self, method, path, body=None):
        """Make authenticated request"""
        timestamp = str(int(time.time() * 1000))
        signature = self._sign(method, path, body)
        
        headers = {
            'ACCESS-KEY': self.api_key,
            'ACCESS-SIGN': signature,
            'ACCESS-TIMESTAMP': timestamp,
            'ACCESS-PASSPHRASE': self.passphrase,
            'Content-Type': 'application/json',
            'User-Agent': 'Trading-Bot/1.0'
        }
        
        url = self.BASE_URL + path
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, headers=headers, data=body)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Bitget request error: {e}")
            return {'code': 'error', 'msg': str(e)}
    
    def get_balance(self):
        """Get account balance"""
        path = '/api/v2/spot/account/assets'
        response = self._request('GET', path)
        
        if response.get('code') == '00000':
            data = response.get('data', [])
            balances = {}
            for asset in data:
                balances[asset['coin']] = {
                    'available': float(asset.get('available', 0)),
                    'frozen': float(asset.get('frozen', 0)),
                    'total': float(asset.get('available', 0)) + float(asset.get('frozen', 0))
                }
            return {'success': True, 'balances': balances}
        
        return {'success': False, 'error': response.get('msg')}
    
    def place_order(self, symbol, side, order_type, size=None, price=None):
        """Place order"""
        path = '/api/v2/spot/trade/place-order'
        
        body = json.dumps({
            'symbol': symbol,
            'side': side.lower(),
            'orderType': order_type.lower(),
            'force': 'gtc',
            'size': size,
            'price': price
        })
        
        response = self._request('POST', path, body)
        
        if response.get('code') == '00000':
            order = response.get('data', {})
            return {
                'success': True,
                'order_id': order.get('orderId'),
                'symbol': symbol,
                'side': side,
                'type': order_type
            }
        
        return {'success': False, 'error': response.get('msg')}
    
    def get_open_orders(self, symbol='BTCUSDT'):
        """Get open orders"""
        path = f'/api/v2/spot/trade/unfilled-orders?symbol={symbol}'
        response = self._request('GET', path)
        
        if response.get('code') == '00000':
            orders = response.get('data', [])
            return {'success': True, 'orders': orders}
        
        return {'success': False, 'error': response.get('msg')}
    
    def cancel_order(self, symbol, order_id):
        """Cancel order"""
        path = '/api/v2/spot/trade/cancel-order'
        
        body = json.dumps({
            'symbol': symbol,
            'orderId': order_id
        })
        
        response = self._request('POST', path, body)
        
        if response.get('code') == '00000':
            return {'success': True, 'order_id': order_id}
        
        return {'success': False, 'error': response.get('msg')}

bitget_client = BitgetClient()
```

---

## TIER 2: AGENT SYSTEM

### File: backend/agents/__init__.py
```python
from .base import BaseAgent
from .technical import TechnicalAgent
from .sentiment import SentimentAgent
from .fundamental import FundamentalAgent
from .risk import RiskAgent
from .portfolio import PortfolioAgent
from .cio import CIOAgent
from .intelligence import IntelligenceAgent

__all__ = [
    'BaseAgent',
    'TechnicalAgent',
    'SentimentAgent',
    'FundamentalAgent',
    'RiskAgent',
    'PortfolioAgent',
    'CIOAgent',
    'IntelligenceAgent'
]
```

### File: backend/agents/base.py
```python
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
```

### File: backend/agents/technical.py
```python
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
```

### File: backend/agents/sentiment.py
```python
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
```

### File: backend/agents/fundamental.py
```python
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
```

### File: backend/agents/risk.py
```python
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
```

### File: backend/agents/portfolio.py
```python
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
```

### File: backend/agents/cio.py
```python
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
```

### File: backend/agents/intelligence.py
```python
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
```

---

**Note: This is a massive document. Continue in next message with Tier 3 (Backtesting), Tier 4 (API/Safety), Tier 5 (Deployment), and Tier 6 (Docs).**

**Ready for me to continue with the remaining tiers?**
