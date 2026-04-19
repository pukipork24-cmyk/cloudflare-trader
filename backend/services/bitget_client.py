"""Bitget API client"""
import logging

logger = logging.getLogger(__name__)

class BitgetClient:
    def __init__(self):
        self.available = False
        logger.info("⚠️ Bitget client initialized (stub mode)")

    def get_balance(self):
        return {"success": False, "error": "Bitget not configured"}

    def place_order(self, symbol, side, order_type, size):
        return {"success": False, "error": "Bitget not configured"}

    def get_open_orders(self, symbol):
        return {"success": False, "error": "Bitget not configured"}

# Global instance
bitget_client = BitgetClient()
