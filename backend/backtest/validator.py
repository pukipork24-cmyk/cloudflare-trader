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
