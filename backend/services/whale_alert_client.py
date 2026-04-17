"""Whale Alert API for large transaction monitoring"""
import requests
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class WhaleAlertClient:
    """Monitor large crypto transactions"""

    BASE_URL = 'https://api.whale-alert.io/v1'

    def __init__(self):
        self.api_key = Config.WHALE_ALERT_API_KEY

    def get_transactions(self, symbol='btc', min_value=100000):
        """Fetch large transactions"""
        try:
            params = {
                'api_key': self.api_key,
                'symbol': symbol,
                'min_value': min_value
            }

            response = requests.get(f"{self.BASE_URL}/transactions", params=params, timeout=5)
            response.raise_for_status()

            data = response.json()

            if data.get('status') == 'success':
                return {
                    'success': True,
                    'transactions': data.get('result', [])
                }
            else:
                logger.warning(f"Whale alert error: {data.get('message')}")
                return {'success': False, 'error': data.get('message')}

        except Exception as e:
            logger.error(f"Whale alert error: {e}")
            return {'success': False, 'error': str(e)}

    def analyze_for_signals(self, transactions):
        """Extract trading signals from whale activity"""
        signals = []

        for tx in transactions:
            if tx.get('transaction_type') == 'deposit':
                signals.append({
                    'type': 'whale_buy_signal',
                    'confidence': 60,
                    'amount': tx.get('amount'),
                    'exchange': tx.get('to_address_tag')
                })
            elif tx.get('transaction_type') == 'withdrawal':
                signals.append({
                    'type': 'whale_sell_signal',
                    'confidence': 60,
                    'amount': tx.get('amount'),
                    'exchange': tx.get('from_address_tag')
                })

        return signals

whale_alert = WhaleAlertClient()
