"""Market regime detector using Hidden Markov Model"""
import numpy as np
import pandas as pd
from hmmlearn import hmm
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from typing import Dict, List, Tuple, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class MarketRegime(Enum):
    TRENDING_UP = "TRENDING_UP"
    TRENDING_DOWN = "TRENDING_DOWN"
    MEAN_REVERTING = "MEAN_REVERTING"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    LOW_VOLATILITY = "LOW_VOLATILITY"
    UNKNOWN = "UNKNOWN"

class RegimeDetector:
    """Market regime detector using Hidden Markov Model"""
    
    def __init__(self, n_regimes: int = 5, lookback_period: int = 100):
        self.n_regimes = n_regimes
        self.lookback_period = lookback_period
        self.hmm_model = None
        self.scaler = StandardScaler()
        self.is_trained = False
        
        # Feature engineering parameters
        self.volatility_window = 20
        self.trend_window = 50
        self.momentum_window = 10
        
        # Regime mapping (will be learned during training)
        self.regime_mapping = {}
        
    def _extract_features(self, df: pd.DataFrame) -> np.ndarray:
        """Extract features for HMM training"""
        if df.empty or len(df) < self.trend_window:
            return np.array([])
        
        features = []
        
        # Returns
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Volatility features
        df['volatility'] = df['returns'].rolling(self.volatility_window).std()
        df['volatility_ratio'] = df['volatility'] / df['volatility'].rolling(50).mean()
        
        # Trend features
        df['sma_short'] = df['close'].rolling(10).mean()
        df['sma_long'] = df['close'].rolling(self.trend_window).mean()
        df['trend_strength'] = (df['sma_short'] / df['sma_long'] - 1) * 100
        
        # Momentum features
        df['momentum'] = df['close'].pct_change(self.momentum_window)
        df['rsi'] = self._calculate_rsi(df['close'], 14)
        
        # Price position
        df['high_low_ratio'] = (df['close'] - df['low'].rolling(20).min()) / \
                              (df['high'].rolling(20).max() - df['low'].rolling(20).min())
        
        # Volume features
        if 'volume' in df.columns:
            df['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
        else:
            df['volume_ratio'] = 1.0
        
        # Select feature columns
        feature_cols = [
            'returns', 'log_returns', 'volatility', 'volatility_ratio',
            'trend_strength', 'momentum', 'rsi', 'high_low_ratio', 'volume_ratio'
        ]
        
        # Remove NaN values
        df_features = df[feature_cols].dropna()
        
        if df_features.empty:
            return np.array([])
        
        return df_features.values
    
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """Calculate RSI indicator"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def train(self, df: pd.DataFrame) -> bool:
        """Train HMM model on historical data"""
        try:
            features = self._extract_features(df)
            if len(features) < self.lookback_period:
                logger.warning("Insufficient data for training regime detector")
                return False
            
            # Normalize features
            features_scaled = self.scaler.fit_transform(features)
            
            # Initialize HMM
            self.hmm_model = hmm.GaussianHMM(
                n_components=self.n_regimes,
                covariance_type="full",
                n_iter=100,
                random_state=42
            )
            
            # Train model
            self.hmm_model.fit(features_scaled)
            
            # Get hidden states for training data
            hidden_states = self.hmm_model.predict(features_scaled)
            
            # Map regimes to states based on characteristics
            self._map_regimes_to_states(df, hidden_states)
            
            self.is_trained = True
            logger.info(f"Regime detector trained with {len(features)} data points")
            return True
            
        except Exception as e:
            logger.error(f"Error training regime detector: {e}")
            return False
    
    def _map_regimes_to_states(self, df: pd.DataFrame, hidden_states: np.ndarray):
        """Map HMM states to meaningful market regimes"""
        if len(hidden_states) == 0:
            return
        
        # Calculate characteristics for each state
        state_characteristics = {}
        
        for state in range(self.n_regimes):
            state_mask = hidden_states == state
            if not np.any(state_mask):
                continue
            
            # Get returns for this state
            state_returns = df['returns'].iloc[state_mask].dropna()
            
            if len(state_returns) > 0:
                avg_return = state_returns.mean()
                volatility = state_returns.std()
                trend_strength = np.mean(np.abs(state_returns))
                
                state_characteristics[state] = {
                    'avg_return': avg_return,
                    'volatility': volatility,
                    'trend_strength': trend_strength,
                    'frequency': np.sum(state_mask) / len(hidden_states)
                }
        
        # Assign regime labels based on characteristics
        for state, chars in state_characteristics.items():
            if chars['avg_return'] > 0.002 and chars['trend_strength'] > 0.01:
                regime = MarketRegime.TRENDING_UP
            elif chars['avg_return'] < -0.002 and chars['trend_strength'] > 0.01:
                regime = MarketRegime.TRENDING_DOWN
            elif chars['volatility'] > 0.03:
                regime = MarketRegime.HIGH_VOLATILITY
            elif chars['volatility'] < 0.01:
                regime = MarketRegime.LOW_VOLATILITY
            else:
                regime = MarketRegime.MEAN_REVERTING
            
            self.regime_mapping[state] = regime
            logger.info(f"State {state} mapped to {regime.value} "
                       f"(return: {chars['avg_return']:.4f}, vol: {chars['volatility']:.4f})")
    
    def predict_regime(self, df: pd.DataFrame) -> Tuple[MarketRegime, float]:
        """Predict current market regime"""
        if not self.is_trained or self.hmm_model is None:
            return MarketRegime.UNKNOWN, 0.0
        
        try:
            features = self._extract_features(df)
            if len(features) == 0:
                return MarketRegime.UNKNOWN, 0.0
            
            # Use last N features for prediction
            recent_features = features[-min(50, len(features)):]
            features_scaled = self.scaler.transform(recent_features)
            
            # Predict most likely state sequence
            hidden_states = self.hmm_model.predict(features_scaled)
            current_state = hidden_states[-1]
            
            # Get state probabilities
            state_probs = self.hmm_model.predict_proba(features_scaled)
            current_probs = state_probs[-1]
            confidence = np.max(current_probs)
            
            # Map to regime
            regime = self.regime_mapping.get(current_state, MarketRegime.UNKNOWN)
            
            return regime, confidence
            
        except Exception as e:
            logger.error(f"Error predicting regime: {e}")
            return MarketRegime.UNKNOWN, 0.0
    
    def get_regime_history(self, df: pd.DataFrame) -> pd.DataFrame:
        """Get regime history for the entire dataset"""
        if not self.is_trained:
            return pd.DataFrame()
        
        try:
            features = self._extract_features(df)
            if len(features) == 0:
                return pd.DataFrame()
            
            features_scaled = self.scaler.transform(features)
            hidden_states = self.hmm_model.predict(features_scaled)
            state_probs = self.hmm_model.predict_proba(features_scaled)
            
            # Create results dataframe
            result_df = df.iloc[len(df) - len(hidden_states):].copy()
            result_df['regime'] = [self.regime_mapping.get(s, MarketRegime.UNKNOWN).value 
                                  for s in hidden_states]
            result_df['regime_confidence'] = np.max(state_probs, axis=1)
            
            return result_df
            
        except Exception as e:
            logger.error(f"Error getting regime history: {e}")
            return pd.DataFrame()
    
    def get_regime_statistics(self, df: pd.DataFrame) -> Dict:
        """Get statistics about regime behavior"""
        if not self.is_trained:
            return {}
        
        regime_history = self.get_regime_history(df)
        if regime_history.empty:
            return {}
        
        stats = {}
        
        for regime in MarketRegime:
            regime_data = regime_history[regime_history['regime'] == regime.value]
            
            if not regime_data.empty:
                returns = regime_data['returns'].dropna()
                
                stats[regime.value] = {
                    'count': len(regime_data),
                    'percentage': len(regime_data) / len(regime_history) * 100,
                    'avg_return': returns.mean() if len(returns) > 0 else 0,
                    'volatility': returns.std() if len(returns) > 0 else 0,
                    'max_return': returns.max() if len(returns) > 0 else 0,
                    'min_return': returns.min() if len(returns) > 0 else 0,
                    'avg_confidence': regime_data['regime_confidence'].mean()
                }
        
        return stats
    
    def should_adjust_strategy(self, current_regime: MarketRegime, 
                           strategy_regime: MarketRegime) -> Tuple[bool, str]:
        """Determine if strategy should be adjusted based on regime"""
        if current_regime == MarketRegime.UNKNOWN:
            return False, "Regime unknown - maintain current strategy"
        
        # Define regime compatibility
        compatible_regimes = {
            MarketRegime.TRENDING_UP: [MarketRegime.TRENDING_UP, MarketRegime.MEAN_REVERTING],
            MarketRegime.TRENDING_DOWN: [MarketRegime.TRENDING_DOWN, MarketRegime.MEAN_REVERTING],
            MarketRegime.MEAN_REVERTING: [MarketRegime.MEAN_REVERTING],
            MarketRegime.HIGH_VOLATILITY: [MarketRegime.HIGH_VOLATILITY],
            MarketRegime.LOW_VOLATILITY: [MarketRegime.LOW_VOLATILITY, MarketRegime.TRENDING_UP, 
                                       MarketRegime.TRENDING_DOWN]
        }
        
        if strategy_regime in compatible_regimes.get(current_regime, []):
            return False, "Strategy compatible with current regime"
        
        return True, f"Strategy adjustment needed: {strategy_regime.value} not optimal for {current_regime.value}"
    
    def get_regime_features(self, df: pd.DataFrame) -> Dict:
        """Get current regime features for strategy input"""
        if not self.is_trained:
            return {}
        
        try:
            features = self._extract_features(df)
            if len(features) == 0:
                return {}
            
            # Use last 10 periods for feature calculation
            recent_features = features[-10:]
            
            if len(recent_features) == 0:
                return {}
            
            # Calculate average features
            avg_features = np.mean(recent_features, axis=0)
            
            feature_names = [
                'returns', 'log_returns', 'volatility', 'volatility_ratio',
                'trend_strength', 'momentum', 'rsi', 'high_low_ratio', 'volume_ratio'
            ]
            
            return dict(zip(feature_names, avg_features))
            
        except Exception as e:
            logger.error(f"Error getting regime features: {e}")
            return {}
