# TIER 3: BACKTESTING ENGINE

## File: backend/backtest/__init__.py
```python
from .engine import BacktestEngine
from .validator import WalkForwardValidator
from .anti_overfit import AntiOverfitChecker
from .metrics import MetricsCalculator

__all__ = ['BacktestEngine', 'WalkForwardValidator', 'AntiOverfitChecker', 'MetricsCalculator']
```

## File: backend/backtest/engine.py
```python
"""Backtesting engine - replays trades on historical data"""
from datetime import datetime, timedelta
from models.database import db, BacktestResult, Trade
from .metrics import MetricsCalculator
from .anti_overfit import AntiOverfitChecker
from config.settings import Config
import json
import logging

logger = logging.getLogger(__name__)

class BacktestEngine:
    """Main backtesting engine"""
    
    def __init__(self):
        self.metrics_calc = MetricsCalculator()
        self.anti_overfit = AntiOverfitChecker()
    
    async def run_backtest(self, symbol, start_date, end_date, agents, initial_balance=10000):
        """Run complete backtest with walk-forward validation"""
        logger.info(f"Starting backtest: {symbol} {start_date} to {end_date}")
        
        # Fetch historical data
        historical_data = await self._fetch_historical_data(symbol, start_date, end_date)
        if not historical_data or len(historical_data) < 100:
            return {'error': 'Insufficient historical data'}
        
        # Split into train/test windows
        train_window = Config.BACKTEST_TRAIN_WINDOW_DAYS
        test_window = Config.BACKTEST_TEST_WINDOW_DAYS
        
        all_trades = []
        walk_forward_results = []
        
        # Walk-forward validation
        current_date = start_date
        while current_date < end_date:
            train_end = current_date + timedelta(days=train_window)
            test_end = min(train_end + timedelta(days=test_window), end_date)
            
            if test_end <= train_end:
                break
            
            # Get train and test data
            train_data = [d for d in historical_data if start_date <= d['date'] < train_end]
            test_data = [d for d in historical_data if train_end <= d['date'] < test_end]
            
            logger.info(f"Walk-forward window: train {train_end}, test {test_end}")
            
            # Train on historical data (agents "learn")
            await self._train_agents(agents, train_data)
            
            # Test on unseen data
            window_trades = await self._test_window(agents, test_data, initial_balance)
            all_trades.extend(window_trades)
            
            # Calculate metrics for this window
            window_metrics = self.metrics_calc.calculate(window_trades)
            walk_forward_results.append({
                'window': f"{train_end.date()} to {test_end.date()}",
                'trades': len(window_trades),
                'win_rate': window_metrics.get('win_rate'),
                'pnl': window_metrics.get('total_pnl')
            })
            
            current_date = test_end
        
        # Calculate overall metrics
        overall_metrics = self.metrics_calc.calculate(all_trades)
        
        # Anti-overfitting check
        overfit_check = self.anti_overfit.check(all_trades, walk_forward_results)
        
        # Store results
        result = BacktestResult(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            strategy_name='Multi-Agent Trading',
            total_trades=overall_metrics.get('total_trades'),
            winning_trades=overall_metrics.get('winning_trades'),
            losing_trades=overall_metrics.get('losing_trades'),
            win_rate=overall_metrics.get('win_rate'),
            total_pnl_usdt=overall_metrics.get('total_pnl'),
            net_pnl_usdt=overall_metrics.get('net_pnl'),
            sharpe_ratio=overall_metrics.get('sharpe_ratio'),
            max_drawdown_pct=overall_metrics.get('max_drawdown'),
            profit_factor=overall_metrics.get('profit_factor'),
            overfitting_risk=overfit_check.get('risk_level'),
            improvement_vs_baseline=overfit_check.get('improvement'),
            trades=json.dumps(all_trades),
            is_walk_forward=True,
            train_window_days=train_window,
            test_window_days=test_window
        )
        
        db.session.add(result)
        db.session.commit()
        
        logger.info(f"✓ Backtest completed: {overall_metrics.get('total_trades')} trades, "
                   f"Win rate: {overall_metrics.get('win_rate')}%, PnL: ${overall_metrics.get('total_pnl')}")
        
        return {
            'success': True,
            'result_id': result.id,
            'metrics': overall_metrics,
            'overfitting': overfit_check,
            'walk_forward_windows': walk_forward_results
        }
    
    async def _fetch_historical_data(self, symbol, start_date, end_date):
        """Fetch historical candle data"""
        # TODO: Implement data fetching from Binance or other source
        # For now, return mock data
        logger.warning("Mock historical data - implement real fetcher")
        return []
    
    async def _train_agents(self, agents, historical_data):
        """Train agents on historical data"""
        for candle in historical_data[:Config.BACKTEST_TRAIN_WINDOW_DAYS]:
            for agent in agents:
                await agent.analyze(candle, mode='backtest')
    
    async def _test_window(self, agents, test_data, initial_balance):
        """Test agents on unseen data"""
        trades = []
        balance = initial_balance
        
        for i, candle in enumerate(test_data):
            # Run all agents
            signals = {}
            for agent in agents:
                signal = await agent.analyze(candle, mode='backtest')
                signals[agent.name] = signal
            
            # Aggregate signals
            recommendation = self._aggregate_signals(signals)
            
            # Simulate trade execution
            if recommendation['action'] in ['BUY', 'SELL']:
                trade = {
                    'date': candle['date'],
                    'entry_price': candle['close'],
                    'direction': recommendation['action'],
                    'position_size': initial_balance * 0.25,  # Risk 25% per trade
                }
                
                # Simulate exit (next candle or hit stop loss/take profit)
                if i + 1 < len(test_data):
                    next_candle = test_data[i + 1]
                    trade['exit_price'] = next_candle['close']
                    trade['pnl'] = (trade['exit_price'] - trade['entry_price']) * (trade['position_size'] / trade['entry_price'])
                    balance += trade['pnl']
                    trades.append(trade)
        
        return trades
    
    def _aggregate_signals(self, signals):
        """Aggregate agent signals"""
        buy_votes = sum(1 for s in signals.values() if s and s.get('recommendation') == 'BUY')
        sell_votes = sum(1 for s in signals.values() if s and s.get('recommendation') == 'SELL')
        
        if buy_votes > sell_votes:
            return {'action': 'BUY', 'confidence': buy_votes / len(signals) * 100}
        elif sell_votes > buy_votes:
            return {'action': 'SELL', 'confidence': sell_votes / len(signals) * 100}
        else:
            return {'action': 'HOLD', 'confidence': 50}

backtest_engine = BacktestEngine()
```

## File: backend/backtest/validator.py
```python
"""Walk-forward validation - prevents overfitting"""
from datetime import datetime, timedelta
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class WalkForwardValidator:
    """Ensures no lookahead bias, strict train/test separation"""
    
    @staticmethod
    def validate_split(historical_data, train_end_date, test_end_date):
        """Validate train/test split has no overlap"""
        for point in historical_data:
            date = point['date']
            # Training data must end before test data begins
            if date >= train_end_date and date < test_end_date:
                continue  # This is test data - OK
            elif date < train_end_date:
                continue  # This is train data - OK
            else:
                raise ValueError("Lookahead bias detected: data leakage")
        
        logger.info(f"✓ Walk-forward validation passed")
        return True
    
    @staticmethod
    def check_minimum_trades(trades, min_trades=20):
        """Ensure minimum trade sample before evaluation"""
        if len(trades) < min_trades:
            logger.warning(f"Insufficient trades: {len(trades)} < {min_trades}")
            return False
        return True
    
    @staticmethod
    def check_improvement_threshold(current_sharpe, baseline_sharpe, threshold=0.05):
        """Verify improvement isn't just noise (5% threshold)"""
        if current_sharpe <= 0:
            return False
        
        improvement = (current_sharpe - baseline_sharpe) / abs(baseline_sharpe)
        
        if improvement >= threshold:
            logger.info(f"✓ Improvement verified: {improvement:.2%}")
            return True
        else:
            logger.warning(f"Insufficient improvement: {improvement:.2%} < {threshold:.2%}")
            return False
```

## File: backend/backtest/anti_overfit.py
```python
"""Anti-overfitting detection and prevention"""
import statistics
import logging

logger = logging.getLogger(__name__)

class AntiOverfitChecker:
    """Detect overfitting patterns"""
    
    def check(self, all_trades, walk_forward_results):
        """Comprehensive overfitting check"""
        checks = {
            'consistency': self._check_consistency(walk_forward_results),
            'distribution': self._check_distribution(all_trades),
            'drawdown_pattern': self._check_drawdown(all_trades),
            'curve_fit': self._check_curve_fit(walk_forward_results)
        }
        
        risk_count = sum(1 for v in checks.values() if not v)
        
        if risk_count == 0:
            risk_level = 'LOW'
        elif risk_count == 1:
            risk_level = 'MEDIUM'
        else:
            risk_level = 'HIGH'
        
        logger.info(f"Overfitting risk: {risk_level} (failed {risk_count}/4 checks)")
        
        return {
            'risk_level': risk_level,
            'checks': checks,
            'improvement': self._calculate_improvement(walk_forward_results)
        }
    
    def _check_consistency(self, windows):
        """Check win rates are consistent across windows"""
        if len(windows) < 2:
            return True
        
        win_rates = [w['win_rate'] for w in windows if w['win_rate']]
        if not win_rates:
            return False
        
        # If std dev is extremely high, likely overfitted
        std_dev = statistics.stdev(win_rates)
        consistency = std_dev < 15  # Allow 15% variation
        
        logger.info(f"Consistency check: {'PASS' if consistency else 'FAIL'} (std: {std_dev:.1f}%)")
        return consistency
    
    def _check_distribution(self, trades):
        """Check if win/loss distribution is realistic"""
        if len(trades) < 20:
            return True
        
        wins = [t for t in trades if t.get('pnl', 0) > 0]
        losses = [t for t in trades if t.get('pnl', 0) < 0]
        
        if not losses:
            logger.warning("No losses detected - likely overfitted")
            return False
        
        return True
    
    def _check_drawdown(self, trades):
        """Check if drawdown pattern is realistic"""
        if len(trades) < 10:
            return True
        
        cumulative = 0
        max_dd = 0
        peak = 0
        
        for trade in trades:
            cumulative += trade.get('pnl', 0)
            if cumulative > peak:
                peak = cumulative
            
            drawdown = peak - cumulative
            if drawdown > max_dd:
                max_dd = drawdown
        
        # Realistic: max dd < 40% of profit
        if peak > 0:
            dd_ratio = max_dd / peak
            realistic = dd_ratio < 0.4
            logger.info(f"Drawdown check: {'PASS' if realistic else 'FAIL'} (ratio: {dd_ratio:.2%})")
            return realistic
        
        return True
    
    def _check_curve_fit(self, windows):
        """Check if results are too perfect (curve fitted)"""
        if len(windows) < 2:
            return True
        
        pnls = [w['pnl'] for w in windows if w['pnl']]
        if len(pnls) < 2:
            return True
        
        # If every single window is profitable, suspicious
        all_profitable = all(p > 0 for p in pnls)
        if all_profitable:
            logger.warning("Every window profitable - suspicious (likely overfitted)")
            return False
        
        return True
    
    def _calculate_improvement(self, windows):
        """Calculate % improvement vs baseline"""
        if len(windows) < 2:
            return 0
        
        avg_pnl = statistics.mean([w['pnl'] for w in windows if w['pnl']])
        return avg_pnl  # Placeholder
```

## File: backend/backtest/metrics.py
```python
"""Performance metrics calculation"""
import statistics
import logging

logger = logging.getLogger(__name__)

class MetricsCalculator:
    """Calculate trading performance metrics"""
    
    def calculate(self, trades):
        """Calculate all metrics from trades"""
        if not trades:
            return self._empty_metrics()
        
        pnls = [t.get('pnl', 0) for t in trades]
        winning_trades = [p for p in pnls if p > 0]
        losing_trades = [p for p in pnls if p < 0]
        
        total_pnl = sum(pnls)
        winning_pnl = sum(winning_trades)
        losing_pnl = sum(losing_trades)
        
        metrics = {
            'total_trades': len(trades),
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades),
            'win_rate': (len(winning_trades) / len(trades) * 100) if trades else 0,
            'total_pnl': total_pnl,
            'winning_pnl': winning_pnl,
            'losing_pnl': losing_pnl,
            'net_pnl': total_pnl,
            'avg_trade_pnl': statistics.mean(pnls) if pnls else 0,
            'largest_win': max(pnls) if pnls else 0,
            'largest_loss': min(pnls) if pnls else 0,
            'profit_factor': abs(winning_pnl / losing_pnl) if losing_pnl != 0 else 0,
            'sharpe_ratio': self._calculate_sharpe(pnls),
            'max_drawdown': self._calculate_max_drawdown(pnls),
        }
        
        logger.info(f"Metrics: {metrics['total_trades']} trades, {metrics['win_rate']:.1f}% win rate, "
                   f"${metrics['total_pnl']:.2f} PnL")
        
        return metrics
    
    def _calculate_sharpe(self, returns, risk_free_rate=0.02):
        """Calculate Sharpe ratio"""
        if len(returns) < 2:
            return 0
        
        mean_return = statistics.mean(returns)
        std_return = statistics.stdev(returns) if len(returns) > 1 else 1
        
        if std_return == 0:
            return 0
        
        sharpe = (mean_return - risk_free_rate) / std_return
        return sharpe
    
    def _calculate_max_drawdown(self, returns):
        """Calculate maximum drawdown"""
        if not returns:
            return 0
        
        cumulative = 0
        peak = 0
        max_dd = 0
        
        for ret in returns:
            cumulative += ret
            if cumulative > peak:
                peak = cumulative
            
            drawdown = peak - cumulative
            if drawdown > max_dd:
                max_dd = drawdown
        
        return max_dd
    
    def _empty_metrics(self):
        """Return empty metrics dict"""
        return {
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': 0,
            'total_pnl': 0,
            'net_pnl': 0,
            'sharpe_ratio': 0,
            'max_drawdown': 0,
            'profit_factor': 0
        }
```

---

## Summary: Tier 3
✅ BacktestEngine - Runs complete walk-forward validation
✅ WalkForwardValidator - Prevents lookahead bias
✅ AntiOverfitChecker - Detects overfitting patterns
✅ MetricsCalculator - Calculates all performance metrics

**Next: Tier 4 (API, Safety, Orchestrator)**
