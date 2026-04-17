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
