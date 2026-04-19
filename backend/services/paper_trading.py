"""Paper trading simulator for testing without real money"""
import logging
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class PaperTradingSimulator:
    def __init__(self, initial_capital=10000):
        self.initial_capital = initial_capital
        self.balance = initial_capital
        self.positions = {}  # symbol -> {qty, entry_price, pnl}
        self.trade_history = []
        self.trades_count = 0
        self.enabled = os.getenv('PAPER_TRADING_MODE', 'true').lower() == 'true'

        logger.info(f"✓ Paper Trading initialized: ${initial_capital} starting capital")

    def place_order(self, symbol, side, order_type, size, price):
        """Simulate placing an order"""
        if not self.enabled:
            return {"success": False, "error": "Paper trading disabled"}

        trade_cost = float(size) * float(price)

        if side.upper() == 'BUY':
            if trade_cost > self.balance:
                return {
                    "success": False,
                    "error": f"Insufficient balance: need ${trade_cost}, have ${self.balance}"
                }

            self.balance -= trade_cost
            if symbol not in self.positions:
                self.positions[symbol] = {"qty": 0, "entry_price": 0, "trades": []}

            # Update position
            old_qty = self.positions[symbol]["qty"]
            self.positions[symbol]["qty"] += float(size)
            self.positions[symbol]["entry_price"] = (
                (old_qty * self.positions[symbol]["entry_price"] + float(size) * float(price)) /
                self.positions[symbol]["qty"]
            )

        elif side.upper() == 'SELL':
            if symbol not in self.positions or self.positions[symbol]["qty"] < float(size):
                return {
                    "success": False,
                    "error": f"Insufficient position: have {self.positions.get(symbol, {}).get('qty', 0)}, want to sell {size}"
                }

            self.balance += trade_cost
            self.positions[symbol]["qty"] -= float(size)

            # Calculate PnL for this trade
            entry = self.positions[symbol]["entry_price"]
            pnl = (float(price) - entry) * float(size)
            self.positions[symbol]["pnl"] = pnl

        # Record trade
        self.trades_count += 1
        trade = {
            "id": f"paper_{self.trades_count}",
            "symbol": symbol,
            "side": side,
            "size": float(size),
            "price": float(price),
            "timestamp": datetime.utcnow().isoformat(),
            "total": trade_cost
        }
        self.trade_history.append(trade)

        logger.info(f"📋 Paper trade: {side} {size} {symbol} @ ${price}")

        return {
            "success": True,
            "order_id": trade["id"],
            "symbol": symbol,
            "side": side,
            "size": float(size),
            "price": float(price),
            "balance": self.balance,
            "timestamp": datetime.utcnow().isoformat()
        }

    def get_balance(self):
        """Get account balance including positions"""
        if not self.enabled:
            return {"success": False, "error": "Paper trading disabled"}

        total_value = self.balance
        balances = {"USD": self.balance}

        # Add position values
        for symbol, pos in self.positions.items():
            if pos["qty"] > 0:
                # Would need current price to calculate actual value
                # For now, just track position
                balances[symbol.replace("USDT", "")] = pos["qty"]

        logger.info(f"📊 Paper balance: ${self.balance} cash, {len(self.positions)} positions")

        return {
            "success": True,
            "cash": self.balance,
            "balances": balances,
            "positions": self.positions,
            "initial_capital": self.initial_capital,
            "total_trades": self.trades_count,
            "timestamp": datetime.utcnow().isoformat()
        }

    def get_portfolio_summary(self):
        """Get summary of performance"""
        if not self.enabled:
            return {"success": False, "error": "Paper trading disabled"}

        profit_loss = self.balance - self.initial_capital
        roi = (profit_loss / self.initial_capital) * 100 if self.initial_capital > 0 else 0

        return {
            "success": True,
            "initial_capital": self.initial_capital,
            "current_balance": self.balance,
            "profit_loss": profit_loss,
            "roi_percent": roi,
            "total_trades": self.trades_count,
            "open_positions": len([p for p in self.positions.values() if p["qty"] > 0]),
            "timestamp": datetime.utcnow().isoformat()
        }

    def reset(self):
        """Reset paper trading to initial state"""
        self.balance = self.initial_capital
        self.positions = {}
        self.trade_history = []
        self.trades_count = 0
        logger.info("🔄 Paper trading reset")
        return {"success": True, "message": "Paper trading reset"}

# Global instance
paper_trader = PaperTradingSimulator(initial_capital=10000)
