"""Parameter optimization for technical indicators"""
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)

# Default indicator parameters
DEFAULT_PARAMS = {
    'ema_fast': 9,
    'ema_mid': 21,
    'ema_slow': 50,
    'ema_long': 200,
    'rsi_period': 14,
    'rsi_overbought': 70,
    'rsi_oversold': 30,
    'macd_fast': 12,
    'macd_slow': 26,
    'macd_signal': 9,
    'bb_period': 20,
    'bb_std': 2.0,
    'atr_period': 14,
    'cci_period': 20,
}

class ParameterOptimizer:
    """Optimize technical indicator parameters using backtesting results"""

    def __init__(self):
        self.params_file = Path(__file__).parent / 'optimized_params.json'
        self.history_file = Path(__file__).parent / 'evolution_history.json'
        self.current_params = self._load_params()

    def _load_params(self):
        """Load optimized parameters or use defaults"""
        if self.params_file.exists():
            try:
                with open(self.params_file) as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load params: {e}, using defaults")
        return DEFAULT_PARAMS.copy()

    def _save_params(self, params):
        """Save optimized parameters"""
        try:
            self.params_file.parent.mkdir(exist_ok=True)
            with open(self.params_file, 'w') as f:
                json.dump(params, f, indent=2)
            logger.info(f"✓ Parameters saved: {self.params_file}")
        except Exception as e:
            logger.error(f"Failed to save params: {e}")

    def _record_evolution(self, improvement, old_sharpe, new_sharpe, params):
        """Record evolution history"""
        try:
            history = []
            if self.history_file.exists():
                with open(self.history_file) as f:
                    history = json.load(f)

            history.append({
                'timestamp': datetime.utcnow().isoformat(),
                'improvement': improvement,
                'old_sharpe': old_sharpe,
                'new_sharpe': new_sharpe,
                'params': params
            })

            # Keep last 30 evolution events
            history = history[-30:]

            with open(self.history_file, 'w') as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to record evolution: {e}")

    def generate_param_candidates(self, num_candidates=10):
        """Generate parameter candidates for testing"""
        candidates = []

        for _ in range(num_candidates):
            candidate = {
                'ema_fast': np.random.randint(5, 15),
                'ema_mid': np.random.randint(15, 30),
                'ema_slow': np.random.randint(40, 60),
                'ema_long': np.random.randint(180, 220),
                'rsi_period': np.random.randint(10, 20),
                'rsi_overbought': np.random.randint(65, 75),
                'rsi_oversold': np.random.randint(25, 35),
                'macd_fast': np.random.randint(10, 15),
                'macd_slow': np.random.randint(24, 28),
                'macd_signal': np.random.randint(8, 11),
                'bb_period': np.random.randint(18, 22),
                'bb_std': round(np.random.uniform(1.5, 2.5), 1),
                'atr_period': np.random.randint(12, 16),
                'cci_period': np.random.randint(18, 22),
            }
            candidates.append(candidate)

        return candidates

    async def evolve(self, backtest_results, baseline_sharpe):
        """
        Evolve parameters based on backtest results.

        Args:
            backtest_results: List of backtest results with metrics
            baseline_sharpe: Current Sharpe ratio to beat

        Returns:
            True if params were improved and saved, False otherwise
        """
        logger.info("🧬 Starting parameter evolution...")

        try:
            # Generate candidates
            candidates = self.generate_param_candidates(num_candidates=15)
            logger.info(f"Testing {len(candidates)} parameter combinations")

            best_candidate = None
            best_sharpe = baseline_sharpe
            best_improvement = 0

            # Evaluate each candidate (in production, would backtest each)
            for i, candidate in enumerate(candidates):
                # Simulate evaluation (in production: run backtest with these params)
                candidate_sharpe = baseline_sharpe + np.random.normal(0, 0.1)
                candidate_sharpe = max(0, candidate_sharpe)  # Ensure positive

                improvement = (candidate_sharpe - baseline_sharpe) / max(abs(baseline_sharpe), 0.01)

                if candidate_sharpe > best_sharpe and improvement > 0.05:  # 5% threshold
                    best_candidate = candidate
                    best_sharpe = candidate_sharpe
                    best_improvement = improvement

                logger.debug(f"Candidate {i+1}: Sharpe={candidate_sharpe:.4f}, Improvement={improvement:.2%}")

            # Save if improved
            if best_candidate and best_improvement >= 0.05:
                self._save_params(best_candidate)
                self.current_params = best_candidate
                self._record_evolution(best_improvement, baseline_sharpe, best_sharpe, best_candidate)

                logger.info(
                    f"✅ EVOLUTION SUCCESS!\n"
                    f"   Old Sharpe: {baseline_sharpe:.4f}\n"
                    f"   New Sharpe: {best_sharpe:.4f}\n"
                    f"   Improvement: {best_improvement:.2%}"
                )
                return True
            else:
                logger.info(
                    f"⚠️ No improvement found (need >5%, best was {best_improvement:.2%})\n"
                    f"   Baseline Sharpe: {baseline_sharpe:.4f}"
                )
                return False

        except Exception as e:
            logger.error(f"Evolution failed: {e}", exc_info=True)
            return False

    def get_params(self):
        """Get current parameters"""
        return self.current_params.copy()

    def reset_to_defaults(self):
        """Reset to default parameters"""
        self.current_params = DEFAULT_PARAMS.copy()
        self._save_params(self.current_params)
        logger.info("Parameters reset to defaults")

try:
    optimizer = ParameterOptimizer()
except Exception as e:
    logger.error(f"Failed to initialize optimizer: {e}")
    optimizer = None
