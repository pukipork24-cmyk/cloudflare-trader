"""Data validation layer using Pydantic models"""
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Union
from datetime import datetime
from enum import Enum
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"

class Timeframe(str, Enum):
    ONE_MINUTE = "1m"
    FIVE_MINUTES = "5m"
    FIFTEEN_MINUTES = "15m"
    ONE_HOUR = "1h"
    FOUR_HOURS = "4h"
    ONE_DAY = "1d"

class MarketDataSchema(BaseModel):
    """Schema for validating market data"""
    symbol: str = Field(..., min_length=1, max_length=20)
    timestamp: datetime
    open: float = Field(..., gt=0)
    high: float = Field(..., gt=0)
    low: float = Field(..., gt=0)
    close: float = Field(..., gt=0)
    volume: float = Field(..., ge=0)
    
    @validator('high')
    def high_must_be_gte_open(cls, v, values):
        if 'open' in values and v < values['open']:
            raise ValueError('high must be >= open')
        return v
    
    @validator('low')
    def low_must_be_lte_open(cls, v, values):
        if 'open' in values and v > values['open']:
            raise ValueError('low must be <= open')
        return v
    
    @validator('high')
    def high_must_be_gte_close(cls, v, values):
        if 'close' in values and v < values['close']:
            raise ValueError('high must be >= close')
        return v
    
    @validator('low')
    def low_must_be_lte_close(cls, v, values):
        if 'close' in values and v > values['close']:
            raise ValueError('low must be <= close')
        return v

class OrderSchema(BaseModel):
    """Schema for validating orders"""
    symbol: str = Field(..., min_length=1, max_length=20)
    side: OrderSide
    order_type: OrderType
    quantity: float = Field(..., gt=0)
    price: Optional[float] = Field(None, gt=0)
    stop_price: Optional[float] = Field(None, gt=0)
    time_in_force: str = Field("GTC", regex="^(GTC|IOC|FOK)$")
    
    @validator('price')
    def price_required_for_limit_orders(cls, v, values):
        if values.get('order_type') == OrderType.LIMIT and v is None:
            raise ValueError('price is required for limit orders')
        return v
    
    @validator('stop_price')
    def stop_price_required_for_stop_orders(cls, v, values):
        if values.get('order_type') in [OrderType.STOP_LOSS, OrderType.TAKE_PROFIT] and v is None:
            raise ValueError('stop_price is required for stop orders')
        return v

class PositionSchema(BaseModel):
    """Schema for validating positions"""
    symbol: str = Field(..., min_length=1, max_length=20)
    size: float = Field(..., gt=0)
    entry_price: float = Field(..., gt=0)
    current_price: float = Field(..., gt=0)
    side: OrderSide
    unrealized_pnl: float = 0.0
    stop_loss: Optional[float] = Field(None, gt=0)
    take_profit: Optional[float] = Field(None, gt=0)

class TradeSchema(BaseModel):
    """Schema for validating completed trades"""
    id: Optional[str] = None
    symbol: str = Field(..., min_length=1, max_length=20)
    side: OrderSide
    quantity: float = Field(..., gt=0)
    entry_price: float = Field(..., gt=0)
    exit_price: float = Field(..., gt=0)
    entry_time: datetime
    exit_time: datetime
    pnl: float
    pnl_percentage: float
    fees: float = 0.0
    strategy: Optional[str] = None
    confidence_score: Optional[float] = Field(None, ge=0, le=100)

class RiskMetricsSchema(BaseModel):
    """Schema for risk metrics"""
    var_95: float = Field(..., description="95% Value at Risk")
    var_99: float = Field(..., description="99% Value at Risk")
    cvar_95: float = Field(..., description="95% Conditional Value at Risk")
    max_drawdown: float = Field(..., description="Maximum drawdown")
    current_drawdown: float = Field(..., description="Current drawdown")
    sharpe_ratio: float = Field(..., description="Sharpe ratio")
    portfolio_volatility: float = Field(..., description="Portfolio volatility")
    total_exposure: float = Field(..., description="Total portfolio exposure")

class DataValidator:
    """Data validation and normalization utilities"""
    
    @staticmethod
    def validate_market_data(data: Union[Dict, List[Dict]]) -> List[MarketDataSchema]:
        """Validate market data using Pydantic schema"""
        if isinstance(data, dict):
            data = [data]
        
        validated_data = []
        errors = []
        
        for i, item in enumerate(data):
            try:
                validated = MarketDataSchema(**item)
                validated_data.append(validated)
            except Exception as e:
                errors.append(f"Item {i}: {str(e)}")
        
        if errors:
            logger.warning(f"Market data validation errors: {errors}")
        
        return validated_data
    
    @staticmethod
    def validate_order(order_data: Dict) -> Optional[OrderSchema]:
        """Validate order data using Pydantic schema"""
        try:
            return OrderSchema(**order_data)
        except Exception as e:
            logger.error(f"Order validation error: {e}")
            return None
    
    @staticmethod
    def validate_position(position_data: Dict) -> Optional[PositionSchema]:
        """Validate position data using Pydantic schema"""
        try:
            return PositionSchema(**position_data)
        except Exception as e:
            logger.error(f"Position validation error: {e}")
            return None
    
    @staticmethod
    def validate_trade(trade_data: Dict) -> Optional[TradeSchema]:
        """Validate trade data using Pydantic schema"""
        try:
            return TradeSchema(**trade_data)
        except Exception as e:
            logger.error(f"Trade validation error: {e}")
            return None
    
    @staticmethod
    def normalize_ohlcv_data(df: pd.DataFrame) -> pd.DataFrame:
        """Normalize and clean OHLCV data"""
        if df.empty:
            return df
        
        # Make a copy to avoid SettingWithCopyWarning
        df = df.copy()
        
        # Ensure required columns exist
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        for col in required_cols:
            if col not in df.columns:
                logger.error(f"Missing required column: {col}")
                return pd.DataFrame()
        
        # Remove invalid rows
        initial_len = len(df)
        
        # High must be >= low
        df = df[df['high'] >= df['low']]
        
        # High must be >= open and close
        df = df[(df['high'] >= df['open']) & (df['high'] >= df['close'])]
        
        # Low must be <= open and close
        df = df[(df['low'] <= df['open']) & (df['low'] <= df['close'])]
        
        # Remove zero or negative values
        df = df[(df['open'] > 0) & (df['high'] > 0) & 
                 (df['low'] > 0) & (df['close'] > 0) & (df['volume'] >= 0)]
        
        # Remove duplicates
        df = df.drop_duplicates(subset=['timestamp'], keep='last')
        
        # Sort by timestamp
        df = df.sort_values('timestamp')
        
        # Handle missing values
        numeric_cols = ['open', 'high', 'low', 'close', 'volume']
        df[numeric_cols] = df[numeric_cols].fillna(method='ffill').fillna(method='bfill')
        
        # Remove outliers using IQR method
        for col in ['open', 'high', 'low', 'close']:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]
        
        final_len = len(df)
        removed = initial_len - final_len
        
        if removed > 0:
            logger.info(f"Data normalization removed {removed} invalid rows "
                       f"({removed/initial_len*100:.1f}% of data)")
        
        return df
    
    @staticmethod
    def detect_and_handle_splits(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Detect and handle stock splits in price data"""
        if df.empty or len(df) < 2:
            return df
        
        # Calculate daily returns
        df['returns'] = df['close'].pct_change()
        
        # Detect potential splits (returns > 50% or < -50%)
        split_threshold = 0.5
        potential_splits = df[abs(df['returns']) > split_threshold]
        
        if not potential_splits.empty:
            logger.warning(f"Potential splits detected for {symbol}: "
                          f"{len(potential_splits)} instances")
            
            # For each potential split, adjust historical prices
            for split_date in potential_splits.index:
                split_ratio = df.loc[split_date, 'close'] / df.loc[split_date, 'open']
                
                if split_ratio > 1.5:  # Forward split
                    adjustment_factor = 1 / split_ratio
                    df.loc[df.index < split_date, ['open', 'high', 'low', 'close']] *= adjustment_factor
                    logger.info(f"Applied forward split adjustment: {adjustment_factor:.3f}")
                
                elif split_ratio < 0.5:  # Reverse split
                    adjustment_factor = 1 / split_ratio
                    df.loc[df.index < split_date, ['open', 'high', 'low', 'close']] *= adjustment_factor
                    logger.info(f"Applied reverse split adjustment: {adjustment_factor:.3f}")
        
        # Drop temporary returns column
        df = df.drop('returns', axis=1)
        
        return df
    
    @staticmethod
    def validate_data_quality(df: pd.DataFrame, symbol: str) -> Dict[str, Union[bool, float, str]]:
        """Validate data quality and return quality metrics"""
        if df.empty:
            return {
                "valid": False,
                "error": "Empty dataframe",
                "completeness": 0.0,
                "outlier_percentage": 0.0,
                "duplicate_percentage": 0.0
            }
        
        # Check for missing values
        total_cells = len(df) * len(df.columns)
        missing_cells = df.isnull().sum().sum()
        completeness = (total_cells - missing_cells) / total_cells * 100
        
        # Check for outliers using z-score
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        outlier_count = 0
        total_numeric_cells = 0
        
        for col in numeric_cols:
            z_scores = np.abs((df[col] - df[col].mean()) / df[col].std())
            outliers = z_scores > 3
            outlier_count += outliers.sum()
            total_numeric_cells += len(df)
        
        outlier_percentage = (outlier_count / total_numeric_cells) * 100 if total_numeric_cells > 0 else 0
        
        # Check for duplicates
        duplicate_count = df.duplicated().sum()
        duplicate_percentage = (duplicate_count / len(df)) * 100
        
        # Overall validity
        is_valid = (
            completeness >= 95.0 and  # At least 95% complete
            outlier_percentage <= 5.0 and  # Less than 5% outliers
            duplicate_percentage <= 1.0  # Less than 1% duplicates
        )
        
        return {
            "valid": is_valid,
            "error": None if is_valid else "Data quality check failed",
            "completeness": completeness,
            "outlier_percentage": outlier_percentage,
            "duplicate_percentage": duplicate_percentage,
            "total_rows": len(df),
            "date_range": f"{df.index.min()} to {df.index.max()}"
        }
