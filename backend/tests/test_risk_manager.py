"""Unit tests for risk management components"""
import unittest
import sys
import os
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.risk.risk_manager import RiskManager, RiskLevel, Position

class TestRiskManager(unittest.TestCase):
    """Test cases for RiskManager class"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.risk_manager = RiskManager(initial_balance=10000.0)
    
    def test_kelly_position_size_calculation(self):
        """Test Kelly Criterion position sizing"""
        # Test positive expectancy
        win_rate = 0.6
        avg_win = 100.0
        avg_loss = 50.0
        
        position_size = self.risk_manager.calculate_kelly_position_size(
            win_rate, avg_win, avg_loss, 100.0
        )
        
        # Kelly formula: (bp - q) / b where b = avg_win/avg_loss = 2, p = 0.6, q = 0.4
        # (2*0.6 - 0.4) / 2 = 0.4
        # With 0.25 fraction: 0.4 * 0.25 = 0.1 (10%)
        
        self.assertGreater(position_size, 0.01)  # Min 1%
        self.assertLess(position_size, 0.10)   # Max 10%
        self.assertAlmostEqual(position_size, 0.10, places=2)
    
    def test_fixed_fractional_position_size(self):
        """Test fixed fractional position sizing"""
        risk_pct = 2.0
        stop_distance = 5.0  # 5% stop loss
        
        position_size = self.risk_manager.calculate_fixed_fractional_position(
            risk_pct, stop_distance
        )
        
        # Position size = Risk% / Stop Loss Distance = 2.0 / 5.0 = 0.4 (40%)
        # Should be limited to max_kelly_size (10%)
        
        self.assertEqual(position_size, 0.10)  # Max 10%
    
    def test_position_management(self):
        """Test position creation and updates"""
        symbol = "BTC/USDT"
        size = 0.1
        entry_price = 50000.0
        current_price = 51000.0
        
        # Create position
        position = self.risk_manager.update_position(
            symbol, size, entry_price, current_price, "LONG"
        )
        
        self.assertEqual(position.symbol, symbol)
        self.assertEqual(position.size, size)
        self.assertEqual(position.entry_price, entry_price)
        self.assertEqual(position.current_price, current_price)
        self.assertEqual(position.side, "LONG")
        
        # Check unrealized P&L
        expected_pnl = (current_price - entry_price) * size  # 1000.0
        self.assertEqual(position.unrealized_pnl, expected_pnl)
    
    def test_stop_loss_functionality(self):
        """Test stop loss setting and checking"""
        symbol = "BTC/USDT"
        self.risk_manager.update_position(symbol, 0.1, 50000.0, 49000.0, "LONG")
        
        # Set stop loss
        stop_loss = 49000.0
        self.risk_manager.set_stop_loss(symbol, stop_loss)
        
        position = self.risk_manager.positions[symbol]
        self.assertEqual(position.stop_loss, stop_loss)
        
        # Check if stop loss hit
        stopped_positions = self.risk_manager.check_stop_losses()
        self.assertIn(symbol, stopped_positions)
        
        # Test trailing stop
        self.risk_manager.set_stop_loss(symbol, 49500.0, trailing=True)
        position = self.risk_manager.positions[symbol]
        self.assertEqual(position.trailing_stop, 49500.0)
    
    def test_exposure_limits(self):
        """Test portfolio exposure limits"""
        # Add positions that exceed limits
        self.risk_manager.update_position("BTC", 0.4, 50000.0, 50000.0)  # 40% > 30% limit
        self.risk_manager.update_position("ETH", 0.2, 3000.0, 3000.0)   # 20% > 30% limit
        
        exposure_ok, violations = self.risk_manager.check_exposure_limits()
        
        self.assertFalse(exposure_ok)
        self.assertGreater(len(violations), 0)
        self.assertTrue(any("BTC" in v for v in violations))
        self.assertTrue(any("ETH" in v for v in violations))
    
    def test_var_cvar_calculation(self):
        """Test VaR and CVaR calculations"""
        # Create sample returns
        returns = pd.Series([0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.01, -0.02])
        
        var_95, cvar_95 = self.risk_manager.calculate_var_cvar(returns, 0.95)
        
        # Sort returns: [-0.03, -0.02, -0.02, -0.01, -0.01, 0.01, 0.01, 0.02, 0.03]
        # For 95% VaR (5% worst): index = floor(8 * 0.05) = 0
        # VaR should be the 0th element (worst): -0.03
        
        self.assertLessEqual(var_95, -0.02)  # Should be negative
        self.assertLessEqual(cvar_95, var_95)   # CVaR should be <= VaR
    
    def test_risk_summary(self):
        """Test risk summary generation"""
        # Add some test data
        self.risk_manager.current_balance = 10500.0  # $500 profit
        self.risk_manager.daily_start_balance = 10000.0
        
        summary = self.risk_manager.get_risk_summary()
        
        self.assertEqual(summary['current_balance'], 10500.0)
        self.assertEqual(summary['daily_pnl'], 500.0)
        self.assertEqual(summary['daily_pnl_pct'], 5.0)
        self.assertTrue(summary['trading_allowed'])
        self.assertFalse(summary['kill_switch_active'])
    
    def test_kill_switch(self):
        """Test kill switch functionality"""
        # Initially should be inactive
        self.assertFalse(self.risk_manager.kill_switch_active)
        
        # Activate kill switch
        positions_to_close = self.risk_manager.activate_kill_switch("Test activation")
        
        self.assertTrue(self.risk_manager.kill_switch_active)
        self.assertIsInstance(positions_to_close, list)
        
        # Trading should be disabled
        trading_allowed, reason = self.risk_manager.is_trading_allowed()
        self.assertFalse(trading_allowed)
        self.assertEqual(reason, "Kill switch active")
        
        # Deactivate kill switch
        self.risk_manager.deactivate_kill_switch()
        self.assertFalse(self.risk_manager.kill_switch_active)

if __name__ == '__main__':
    unittest.main()
