"""Bitget API client with real trading capabilities"""
import os
import logging
import requests
import hmac
import hashlib
import json
import time
from datetime import datetime

logger = logging.getLogger(__name__)

class BitgetClient:
    def __init__(self, paper_trading=True):
        self.api_key = os.getenv('BITGET_API_KEY', '')
        self.api_secret = os.getenv('BITGET_API_SECRET', '')
        self.passphrase = os.getenv('BITGET_PASSPHRASE', '')
        self.paper_trading = paper_trading

        # Use testnet for paper trading, mainnet for real
        if paper_trading:
            self.base_url = 'https://api.bitget-testnet.com'  # Bitget testnet
        else:
            self.base_url = 'https://api.bitget.com'  # Bitget mainnet

        self.available = bool(self.api_key and self.api_secret)

        if self.available:
            mode = "PAPER (TESTNET)" if paper_trading else "LIVE (MAINNET)"
            logger.info(f"✓ Bitget client initialized: {mode} mode")
        else:
            logger.warning("⚠️ Bitget client initialized (stub mode - missing API credentials)")

    def _sign_request(self, method, path, body=''):
        """Generate HMAC-SHA256 signature for Bitget API"""
        timestamp = str(int(time.time() * 1000))
        message = timestamp + method.upper() + path
        if body:
            message += body

        signature = hmac.new(
            self.api_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()

        import base64
        return base64.b64encode(signature).decode()

    def _get_headers(self, method, path, body=''):
        """Build request headers with authentication"""
        timestamp = str(int(time.time() * 1000))
        signature = self._sign_request(method, path, body)

        return {
            'Content-Type': 'application/json',
            'ACCESS-KEY': self.api_key,
            'ACCESS-SIGN': signature,
            'ACCESS-TIMESTAMP': timestamp,
            'ACCESS-PASSPHRASE': self.passphrase,
            'User-Agent': 'Python-Trader/1.0'
        }

    def get_balance(self):
        """Get account balance"""
        if not self.available:
            return {"success": False, "error": "Bitget credentials not configured"}

        try:
            path = '/api/v2/spot/account/balance'
            headers = self._get_headers('GET', path)

            resp = requests.get(self.base_url + path, headers=headers, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and data.get('code') == '00000':
                balances = {}
                for coin in data.get('data', []):
                    available = float(coin.get('available', 0))
                    if available > 0:
                        balances[coin['coinName']] = available

                logger.info(f"✓ Fetched Bitget balance: {len(balances)} coins")
                return {"success": True, "balances": balances, "timestamp": datetime.utcnow().isoformat()}
            else:
                error = data.get('msg', 'Unknown error')
                logger.error(f"✗ Bitget balance error: {error}")
                return {"success": False, "error": error}

        except Exception as e:
            logger.error(f"✗ Bitget balance exception: {str(e)}")
            return {"success": False, "error": str(e)}

    def place_order(self, symbol, side, order_type, size, price=None):
        """Place a spot trade order"""
        if not self.available:
            return {"success": False, "error": "Bitget credentials not configured"}

        try:
            path = '/api/v2/spot/trade/place-order'

            body = {
                'symbol': symbol,  # e.g., 'BTCUSDT'
                'side': side.upper(),  # 'BUY' or 'SELL'
                'orderType': order_type.upper(),  # 'LIMIT' or 'MARKET'
                'quantity': str(size),
                'clientOid': f"trader_{int(time.time() * 1000)}"
            }

            if order_type.upper() == 'LIMIT' and price:
                body['price'] = str(price)

            body_str = json.dumps(body)
            headers = self._get_headers('POST', path, body_str)

            resp = requests.post(self.base_url + path, headers=headers, data=body_str, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and data.get('code') == '00000':
                order_id = data.get('data', {}).get('orderId')
                logger.info(f"✓ Order placed: {symbol} {side} {size} (Order ID: {order_id})")
                return {
                    "success": True,
                    "order_id": order_id,
                    "symbol": symbol,
                    "side": side,
                    "size": size,
                    "timestamp": datetime.utcnow().isoformat()
                }
            else:
                error = data.get('msg', 'Unknown error')
                logger.error(f"✗ Bitget order error: {error}")
                return {"success": False, "error": error}

        except Exception as e:
            logger.error(f"✗ Bitget order exception: {str(e)}")
            return {"success": False, "error": str(e)}

    def get_open_orders(self, symbol):
        """Get open orders for a symbol"""
        if not self.available:
            return {"success": False, "error": "Bitget credentials not configured"}

        try:
            path = f'/api/v2/spot/trade/open-orders?symbol={symbol}'
            headers = self._get_headers('GET', path)

            resp = requests.get(self.base_url + path, headers=headers, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and data.get('code') == '00000':
                orders = data.get('data', [])
                logger.info(f"✓ Fetched {len(orders)} open orders for {symbol}")
                return {
                    "success": True,
                    "orders": orders,
                    "symbol": symbol,
                    "timestamp": datetime.utcnow().isoformat()
                }
            else:
                error = data.get('msg', 'Unknown error')
                logger.error(f"✗ Bitget open orders error: {error}")
                return {"success": False, "error": error}

        except Exception as e:
            logger.error(f"✗ Bitget open orders exception: {str(e)}")
            return {"success": False, "error": str(e)}

    def cancel_order(self, symbol, order_id):
        """Cancel an open order"""
        if not self.available:
            return {"success": False, "error": "Bitget credentials not configured"}

        try:
            path = '/api/v2/spot/trade/cancel-order'
            body = {
                'symbol': symbol,
                'orderId': order_id
            }
            body_str = json.dumps(body)
            headers = self._get_headers('POST', path, body_str)

            resp = requests.post(self.base_url + path, headers=headers, data=body_str, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and data.get('code') == '00000':
                logger.info(f"✓ Order cancelled: {order_id}")
                return {"success": True, "order_id": order_id}
            else:
                error = data.get('msg', 'Unknown error')
                logger.error(f"✗ Bitget cancel error: {error}")
                return {"success": False, "error": error}

        except Exception as e:
            logger.error(f"✗ Bitget cancel exception: {str(e)}")
            return {"success": False, "error": str(e)}

# Global instance
paper_mode = os.getenv('PAPER_TRADING_MODE', 'true').lower() == 'true'
bitget_client = BitgetClient(paper_trading=paper_mode)
