"""Advanced Risk Management Module"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    EXTREME = "EXTREME"

@dataclass
class Position:
    symbol: str
    size: float
    entry_price: float
    current_price: float
    stop_loss: Optional[float] = None
    trailing_stop: Optional[float] = None
    unrealized_pnl: float = 0.0
    side: str = "LONG"  # LONG or SHORT

@dataclass
class RiskMetrics:
    var_95: float  # 95% Value at Risk
    var_99: float  # 99% Value at Risk
    cvar_95: float  # 95% Conditional Value at Risk
    max_drawdown: float
    current_drawdown: float
    sharpe_ratio: float
    correlation_matrix: pd.DataFrame
    portfolio_volatility: float

class RiskManager:
    """Advanced risk management with Kelly Criterion, VaR, and position sizing"""
    
    def __init__(self, initial_balance: float = 10000.0):
        self.initial_balance = initial_balance
        self.current_balance = initial_balance
        self.positions: Dict[str, Position] = {}
        self.daily_pnl_history: List[float] = []
        self.trade_history: List[Dict] = []
        self.max_portfolio_exposure_pct = 30.0  # Max 30% per asset
        self.max_total_exposure_pct = 100.0  # Max 100% total exposure
        self.max_daily_loss_pct = 10.0  # Max 10% daily loss
        self.max_concurrent_trades = 5
        self.kill_switch_active = False
        
        # Kelly Criterion parameters
        self.kelly_fraction = 0.25  # Conservative Kelly (1/4 Kelly)
        self.min_kelly_size = 0.01  # Minimum 1% position
        self.max_kelly_size = 0.10  # Maximum 10% position
        
        # Track daily metrics
        self.daily_reset_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        self.daily_high = initial_balance
        self.daily_low = initial_balance
        self.daily_start_balance = initial_balance
        
    def calculate_kelly_position_size(self, win_rate: float, avg_win: float, 
                                 avg_loss: float, current_price: float) -> float:
        """Calculate position size using Kelly Criterion"""
        if avg_loss == 0:
            return self.min_kelly_size
            
        # Kelly Formula: f* = (bp - q) / b
        # where b = avg_win / avg_loss, p = win_rate, q = 1 - win_rate
        b = avg_win / abs(avg_loss)
        p = win_rate
        q = 1 - win_rate
        
        if b * p - q <= 0:
            return 0.0  # Negative expectancy
            
        kelly_fraction = (b * p - q) / b
        
        # Apply conservative fraction and limits
        adjusted_kelly = kelly_fraction * self.kelly_fraction
        position_size_pct = max(self.min_kelly_size, 
                            min(adjusted_kelly, self.max_kelly_size))
        
        logger.info(f"Kelly calculation: win_rate={win_rate:.2f}, b={b:.2f}, "
                   f"kelly={kelly_fraction:.3f}, adjusted={adjusted_kelly:.3f}, "
                   f"position_size={position_size_pct:.3f}")
        
        return position_size_pct
    
    def calculate_fixed_fractional_position(self, risk_per_trade_pct: float, 
                                       stop_distance_pct: float) -> float:
        """Calculate position size using fixed fractional method"""
        if stop_distance_pct <= 0:
            return self.min_kelly_size
            
        # Position size = Risk % / Stop Loss Distance
        position_size_pct = risk_per_trade_pct / stop_distance_pct
        return max(self.min_kelly_size, 
                  min(position_size_pct, self.max_kelly_size))
    
    def update_position(self, symbol: str, size: float, entry_price: float, 
                     current_price: float, side: str = "LONG") -> Position:
        """Update or create position"""
        if symbol in self.positions:
            pos = self.positions[symbol]
            pos.current_price = current_price
            pos.unrealized_pnl = self._calculate_unrealized_pnl(pos)
        else:
            pos = Position(
                symbol=symbol,
                size=size,
                entry_price=entry_price,
                current_price=current_price,
                side=side
            )
            self.positions[symbol] = pos
            
        return pos
    
    def set_stop_loss(self, symbol: str, stop_loss: float, trailing: bool = False):
        """Set stop loss for position"""
        if symbol in self.positions:
            pos = self.positions[symbol]
            pos.stop_loss = stop_loss
            if trailing:
                pos.trailing_stop = stop_loss
            logger.info(f"Stop loss set for {symbol}: ${stop_loss:.2f} "
                       f"{'(trailing)' if trailing else ''}")
    
    def update_trailing_stops(self):
        """Update trailing stop losses based on current price"""
        for symbol, pos in self.positions.items():
            if pos.trailing_stop is not None:
                if pos.side == "LONG":
                    new_trailing = max(pos.trailing_stop, 
                                    pos.current_price * 0.98)  # 2% trail
                else:  # SHORT
                    new_trailing = min(pos.trailing_stop, 
                                    pos.current_price * 1.02)  # 2% trail
                    
                if new_trailing != pos.trailing_stop:
                    pos.trailing_stop = new_trailing
                    logger.info(f"Trailing stop updated for {symbol}: ${new_trailing:.2f}")
    
    def check_stop_losses(self) -> List[str]:
        """Check and return symbols that hit stop loss"""
        stopped_positions = []
        for symbol, pos in self.positions.items():
            stop_to_check = pos.trailing_stop or pos.stop_loss
            if stop_to_check is None:
                continue
                
            if pos.side == "LONG" and pos.current_price <= stop_to_check:
                stopped_positions.append(symbol)
            elif pos.side == "SHORT" and pos.current_price >= stop_to_check:
                stopped_positions.append(symbol)
                
        return stopped_positions
    
    def calculate_portfolio_exposure(self) -> Dict[str, float]:
        """Calculate current portfolio exposure by asset"""
        total_value = self.current_balance
        exposure = {}
        
        for symbol, pos in self.positions.items():
            position_value = pos.size * pos.current_price
            exposure_pct = (position_value / total_value) * 100
            exposure[symbol] = exposure_pct
            
        return exposure
    
    def check_exposure_limits(self) -> Tuple[bool, List[str]]:
        """Check if any position exceeds exposure limits"""
        exposure = self.calculate_portfolio_exposure()
        violations = []
        
        for symbol, pct in exposure.items():
            if pct > self.max_portfolio_exposure_pct:
                violations.append(f"{symbol}: {pct:.1f}% > {self.max_portfolio_exposure_pct}%")
                
        total_exposure = sum(exposure.values())
        if total_exposure > self.max_total_exposure_pct:
            violations.append(f"Total: {total_exposure:.1f}% > {self.max_total_exposure_pct}%")
            
        return len(violations) == 0, violations
    
    def calculate_correlation_risk(self, price_data: pd.DataFrame) -> Dict[str, float]:
        """Calculate correlation between assets to prevent overexposure"""
        if len(price_data.columns) < 2:
            return {}
            
        correlation_matrix = price_data.pct_change().corr()
        
        # Find highly correlated pairs (>0.7)
        high_correlations = {}
        for i in range(len(correlation_matrix.columns)):
            for j in range(i + 1, len(correlation_matrix.columns)):
                asset1 = correlation_matrix.columns[i]
                asset2 = correlation_matrix.columns[j]
                corr = correlation_matrix.iloc[i, j]
                
                if abs(corr) > 0.7:
                    pair_key = f"{asset1}-{asset2}"
                    high_correlations[pair_key] = corr
                    
        return high_correlations
    
    def calculate_var_cvar(self, returns: pd.Series, confidence_level: float = 0.95) -> Tuple[float, float]:
        """Calculate Value at Risk and Conditional Value at Risk"""
        if len(returns) == 0:
            return 0.0, 0.0
            
        sorted_returns = np.sort(returns)
        n = len(sorted_returns)
        
        # VaR
        var_index = int((1 - confidence_level) * n)
        var = sorted_returns[var_index] if var_index < n else sorted_returns[-1]
        
        # CVaR (Expected Shortfall)
        cvar_returns = sorted_returns[:var_index + 1]
        cvar = np.mean(cvar_returns) if len(cvar_returns) > 0 else var
        
        return var, cvar
    
    def calculate_risk_metrics(self, portfolio_returns: pd.Series, 
                           price_data: pd.DataFrame) -> RiskMetrics:
        """Calculate comprehensive risk metrics"""
        if len(portfolio_returns) == 0:
            return RiskMetrics(0, 0, 0, 0, 0, 0, pd.DataFrame(), 0)
        
        # VaR and CVaR
        var_95, cvar_95 = self.calculate_var_cvar(portfolio_returns, 0.95)
        var_99, _ = self.calculate_var_cvar(portfolio_returns, 0.99)
        
        # Drawdown
        cumulative_returns = (1 + portfolio_returns).cumprod()
        running_max = cumulative_returns.expanding().max()
        drawdown = (cumulative_returns - running_max) / running_max
        max_drawdown = drawdown.min()
        current_drawdown = drawdown.iloc[-1] if len(drawdown) > 0 else 0
        
        # Sharpe ratio (assuming 0% risk-free rate)
        sharpe_ratio = portfolio_returns.mean() / portfolio_returns.std() * np.sqrt(252) if portfolio_returns.std() > 0 else 0
        
        # Correlation matrix
        correlation_matrix = price_data.pct_change().corr()
        
        # Portfolio volatility
        portfolio_volatility = portfolio_returns.std() * np.sqrt(252)
        
        return RiskMetrics(
            var_95=var_95,
            var_99=var_99,
            cvar_95=cvar_95,
            max_drawdown=max_drawdown,
            current_drawdown=current_drawdown,
            sharpe_ratio=sharpe_ratio,
            correlation_matrix=correlation_matrix,
            portfolio_volatility=portfolio_volatility
        )
    
    def check_daily_loss_limit(self) -> bool:
        """Check if daily loss limit is breached"""
        current_pnl = self.current_balance - self.daily_start_balance
        daily_loss_pct = (current_pnl / self.daily_start_balance) * 100
        
        if daily_loss_pct < -self.max_daily_loss_pct:
            logger.warning(f"Daily loss limit breached: {daily_loss_pct:.2f}% < -{self.max_daily_loss_pct}%")
            return True
            
        return False
    
    def activate_kill_switch(self, reason: str = "Manual activation"):
        """Emergency kill switch - flatten all positions"""
        self.kill_switch_active = True
        logger.critical(f"🚨 KILL SWITCH ACTIVATED: {reason}")
        logger.critical("All trading will be halted and positions flattened")
        
        # Return all positions to close
        positions_to_close = list(self.positions.keys())
        return positions_to_close
    
    def deactivate_kill_switch(self):
        """Deactivate kill switch"""
        self.kill_switch_active = False
        logger.info("✅ Kill switch deactivated - trading resumed")
    
    def is_trading_allowed(self) -> Tuple[bool, str]:
        """Check if trading is allowed based on all risk controls"""
        if self.kill_switch_active:
            return False, "Kill switch active"
            
        if self.check_daily_loss_limit():
            return False, "Daily loss limit exceeded"
            
        exposure_ok, violations = self.check_exposure_limits()
        if not exposure_ok:
            return False, f"Exposure limits exceeded: {', '.join(violations)}"
            
        if len(self.positions) >= self.max_concurrent_trades:
            return False, f"Max concurrent trades reached ({self.max_concurrent_trades})"
            
        return True, "Trading allowed"
    
    def _calculate_unrealized_pnl(self, position: Position) -> float:
        """Calculate unrealized P&L for position"""
        if position.side == "LONG":
            return (position.current_price - position.entry_price) * position.size
        else:  # SHORT
            return (position.entry_price - position.current_price) * position.size
    
    def reset_daily_metrics(self):
        """Reset daily metrics at start of new day"""
        now = datetime.now()
        if now.date() > self.daily_reset_time.date():
            self.daily_reset_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
            self.daily_start_balance = self.current_balance
            self.daily_high = self.current_balance
            self.daily_low = self.current_balance
            logger.info("Daily risk metrics reset")
    
    def get_risk_summary(self) -> Dict:
        """Get comprehensive risk summary"""
        exposure = self.calculate_portfolio_exposure()
        trading_allowed, reason = self.is_trading_allowed()
        
        return {
            "current_balance": self.current_balance,
            "daily_pnl": self.current_balance - self.daily_start_balance,
            "daily_pnl_pct": ((self.current_balance - self.daily_start_balance) / 
                              self.daily_start_balance) * 100,
            "open_positions": len(self.positions),
            "portfolio_exposure": exposure,
            "total_exposure_pct": sum(exposure.values()),
            "trading_allowed": trading_allowed,
            "risk_reason": reason,
            "kill_switch_active": self.kill_switch_active,
            "max_daily_loss_pct": self.max_daily_loss_pct,
            "max_concurrent_trades": self.max_concurrent_trades
        }
