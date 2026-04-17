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
