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
