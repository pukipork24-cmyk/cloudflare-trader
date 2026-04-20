"""Smart order router with TWAP/VWAP execution and retry logic"""
import asyncio
import time
import logging
from typing import Dict, List, Optional, Tuple, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

class OrderStatus(Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIAL_FILLED = "PARTIAL_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"
    STOP_LIMIT = "STOP_LIMIT"
    TWAP = "TWAP"
    VWAP = "VWAP"

class OrderSide(Enum):
    BUY = "BUY"
    SELL = "SELL"

@dataclass
class Order:
    id: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: str = "GTC"
    status: OrderStatus = OrderStatus.PENDING
    filled_quantity: float = 0.0
    remaining_quantity: float = 0.0
    average_fill_price: float = 0.0
    created_at: datetime = None
    updated_at: datetime = None
    client_order_id: Optional[str] = None
    exchange_order_id: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3

class SmartOrderRouter:
    """Smart order execution with TWAP/VWAP algorithms"""
    
    def __init__(self, exchange_client):
        self.exchange_client = exchange_client
        self.pending_orders: Dict[str, Order] = {}
        self.order_history: List[Order] = []
        self.execution_callbacks: Dict[str, List[Callable]] = {}
        
        # Execution parameters
        self.default_slippage_bps = 5  # 5 basis points
        self.default_commission_bps = 10  # 10 basis points
        self.max_order_size_usd = 50000  # Max $50k per order
        self.twap_default_duration = 300  # 5 minutes in seconds
        self.vwap_default_participation_rate = 0.2  # 20% participation
        
        # Rate limiting
        self.rate_limiter = RateLimiter(max_requests_per_second=10)
        
    async def execute_order(self, order: Order) -> Order:
        """Execute order with smart routing"""
        try:
            # Validate order
            if not self._validate_order(order):
                order.status = OrderStatus.REJECTED
                order.error_message = "Order validation failed"
                return order
            
            # Store order
            self.pending_orders[order.id] = order
            order.created_at = datetime.now()
            order.remaining_quantity = order.quantity
            
            # Choose execution strategy
            if order.order_type == OrderType.TWAP:
                return await self._execute_twap(order)
            elif order.order_type == OrderType.VWAP:
                return await self._execute_vwap(order)
            else:
                return await self._execute_simple(order)
                
        except Exception as e:
            logger.error(f"Error executing order {order.id}: {e}")
            order.status = OrderStatus.REJECTED
            order.error_message = str(e)
            return order
    
    async def _execute_twap(self, order: Order) -> Order:
        """Execute order using Time-Weighted Average Price"""
        logger.info(f"Executing TWAP order {order.id} for {order.quantity} {order.symbol}")
        
        # Calculate slice parameters
        duration_seconds = self.twap_default_duration
        slice_count = min(20, max(5, duration_seconds // 30))  # One slice per 30 seconds min
        slice_quantity = order.quantity / slice_count
        slice_interval = duration_seconds / slice_count
        
        filled_quantity = 0.0
        total_fill_price = 0.0
        
        for i in range(slice_count):
            if order.status in [OrderStatus.CANCELLED, OrderStatus.REJECTED]:
                break
            
            try:
                # Create slice order
                slice_order = Order(
                    id=f"{order.id}_slice_{i}",
                    symbol=order.symbol,
                    side=order.side,
                    order_type=OrderType.MARKET,
                    quantity=min(slice_quantity, order.remaining_quantity),
                    client_order_id=order.id
                )
                
                # Execute slice
                slice_result = await self._execute_with_retry(slice_order)
                
                if slice_result.status == OrderStatus.FILLED:
                    filled_quantity += slice_result.filled_quantity
                    total_fill_price += (slice_result.average_fill_price * 
                                       slice_result.filled_quantity)
                    order.remaining_quantity -= slice_result.filled_quantity
                    
                    # Update order status
                    if order.remaining_quantity <= 0:
                        order.status = OrderStatus.FILLED
                        order.filled_quantity = filled_quantity
                        order.average_fill_price = total_fill_price / filled_quantity
                    else:
                        order.status = OrderStatus.PARTIAL_FILLED
                        order.filled_quantity = filled_quantity
                        order.average_fill_price = total_fill_price / filled_quantity if filled_quantity > 0 else 0.0
                    
                    order.updated_at = datetime.now()
                    
                    # Notify callbacks
                    await self._notify_callbacks(order)
                    
                elif slice_result.status in [OrderStatus.REJECTED, OrderStatus.CANCELLED]:
                    order.status = slice_result.status
                    order.error_message = slice_result.error_message
                    break
                
                # Wait for next slice
                if i < slice_count - 1 and order.status not in [OrderStatus.CANCELLED, OrderStatus.REJECTED]:
                    await asyncio.sleep(slice_interval)
                    
            except Exception as e:
                logger.error(f"Error in TWAP slice {i}: {e}")
                continue
        
        return order
    
    async def _execute_vwap(self, order: Order) -> Order:
        """Execute order using Volume-Weighted Average Price"""
        logger.info(f"Executing VWAP order {order.id} for {order.quantity} {order.symbol}")
        
        # Get recent volume data
        volume_profile = await self._get_volume_profile(order.symbol, lookback_minutes=30)
        
        if not volume_profile:
            # Fallback to TWAP if no volume data
            logger.warning("No volume data available, falling back to TWAP")
            order.order_type = OrderType.TWAP
            return await self._execute_twap(order)
        
        # Calculate VWAP slices based on volume
        total_volume = sum(volume_profile.values())
        filled_quantity = 0.0
        total_fill_price = 0.0
        
        for price_level, volume in sorted(volume_profile.items()):
            if order.status in [OrderStatus.CANCELLED, OrderStatus.REJECTED]:
                break
            
            # Calculate slice size based on volume participation
            target_volume = total_volume * self.vwap_default_participation_rate
            slice_quantity = min(
                order.remaining_quantity,
                target_volume * (volume / total_volume),
                self.max_order_size_usd / price_level
            )
            
            if slice_quantity <= 0:
                continue
            
            try:
                # Create limit order at this price level
                slice_order = Order(
                    id=f"{order.id}_vwap_{price_level}",
                    symbol=order.symbol,
                    side=order.side,
                    order_type=OrderType.LIMIT,
                    quantity=slice_quantity,
                    price=price_level,
                    client_order_id=order.id
                )
                
                # Execute slice
                slice_result = await self._execute_with_retry(slice_order)
                
                if slice_result.status == OrderStatus.FILLED:
                    filled_quantity += slice_result.filled_quantity
                    total_fill_price += (slice_result.average_fill_price * 
                                       slice_result.filled_quantity)
                    order.remaining_quantity -= slice_result.filled_quantity
                    
                    # Update order status
                    if order.remaining_quantity <= 0:
                        order.status = OrderStatus.FILLED
                        order.filled_quantity = filled_quantity
                        order.average_fill_price = total_fill_price / filled_quantity
                    else:
                        order.status = OrderStatus.PARTIAL_FILLED
                        order.filled_quantity = filled_quantity
                        order.average_fill_price = total_fill_price / filled_quantity if filled_quantity > 0 else 0.0
                    
                    order.updated_at = datetime.now()
                    await self._notify_callbacks(order)
                
                # Check if order is complete
                if order.remaining_quantity <= 0:
                    break
                    
                # Wait for market to move
                await asyncio.sleep(10)  # 10 seconds between VWAP levels
                
            except Exception as e:
                logger.error(f"Error in VWAP slice at {price_level}: {e}")
                continue
        
        return order
    
    async def _execute_simple(self, order: Order) -> Order:
        """Execute simple market or limit order"""
        logger.info(f"Executing simple order {order.id}: {order.side.value} {order.quantity} {order.symbol}")
        
        return await self._execute_with_retry(order)
    
    async def _execute_with_retry(self, order: Order) -> Order:
        """Execute order with exponential backoff retry logic"""
        for attempt in range(order.max_retries + 1):
            try:
                # Rate limit check
                await self.rate_limiter.acquire()
                
                # Submit order to exchange
                if order.order_type == OrderType.MARKET:
                    result = await self.exchange_client.place_market_order(
                        symbol=order.symbol,
                        side=order.side.value,
                        quantity=order.quantity
                    )
                elif order.order_type == OrderType.LIMIT:
                    result = await self.exchange_client.place_limit_order(
                        symbol=order.symbol,
                        side=order.side.value,
                        quantity=order.quantity,
                        price=order.price
                    )
                else:
                    raise ValueError(f"Unsupported order type: {order.order_type}")
                
                # Process result
                if result.get('success'):
                    order.status = OrderStatus.SUBMITTED
                    order.exchange_order_id = result.get('order_id')
                    order.updated_at = datetime.now()
                    
                    # Monitor order status
                    await self._monitor_order(order)
                    break
                else:
                    error_msg = result.get('error', 'Unknown error')
                    order.error_message = error_msg
                    
                    # Check if we should retry
                    if self._should_retry_error(error_msg) and attempt < order.max_retries:
                        order.retry_count = attempt + 1
                        backoff_time = min(2 ** attempt, 30)  # Max 30 seconds
                        logger.warning(f"Order {order.id} failed (attempt {attempt + 1}), "
                                       f"retrying in {backoff_time}s: {error_msg}")
                        await asyncio.sleep(backoff_time)
                    else:
                        order.status = OrderStatus.REJECTED
                        break
                        
            except Exception as e:
                logger.error(f"Order execution error (attempt {attempt + 1}): {e}")
                if attempt == order.max_retries:
                    order.status = OrderStatus.REJECTED
                    order.error_message = str(e)
                    break
                
                if attempt < order.max_retries:
                    backoff_time = min(2 ** attempt, 30)
                    await asyncio.sleep(backoff_time)
        
        return order
    
    async def _monitor_order(self, order: Order):
        """Monitor order status until filled or cancelled"""
        max_wait_time = 300  # 5 minutes max wait
        start_time = time.time()
        
        while (time.time() - start_time) < max_wait_time:
            try:
                # Get order status from exchange
                status_result = await self.exchange_client.get_order_status(
                    order.exchange_order_id
                )
                
                if status_result.get('success'):
                    exchange_status = status_result.get('status')
                    
                    # Map exchange status to our status
                    if exchange_status in ['FILLED', 'PARTIALLY_FILLED']:
                        order.status = OrderStatus.FILLED
                        order.filled_quantity = status_result.get('filled_quantity', order.quantity)
                        order.average_fill_price = status_result.get('average_price', 0.0)
                        order.remaining_quantity = order.quantity - order.filled_quantity
                        break
                    elif exchange_status in ['CANCELLED', 'EXPIRED']:
                        order.status = OrderStatus.CANCELLED
                        break
                    elif exchange_status == 'REJECTED':
                        order.status = OrderStatus.REJECTED
                        order.error_message = status_result.get('error', 'Rejected by exchange')
                        break
                
                await asyncio.sleep(2)  # Check every 2 seconds
                
            except Exception as e:
                logger.error(f"Error monitoring order {order.id}: {e}")
                await asyncio.sleep(5)
        
        # Timeout handling
        if order.status == OrderStatus.SUBMITTED:
            logger.warning(f"Order {order.id} monitoring timeout, attempting cancellation")
            await self.cancel_order(order.id)
    
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel pending order"""
        try:
            if order_id in self.pending_orders:
                order = self.pending_orders[order_id]
                
                # Cancel on exchange
                result = await self.exchange_client.cancel_order(order.exchange_order_id)
                
                if result.get('success'):
                    order.status = OrderStatus.CANCELLED
                    order.updated_at = datetime.now()
                    await self._notify_callbacks(order)
                    logger.info(f"Order {order_id} cancelled successfully")
                    return True
                else:
                    logger.error(f"Failed to cancel order {order_id}: {result.get('error')}")
                    return False
            else:
                logger.warning(f"Order {order_id} not found in pending orders")
                return False
                
        except Exception as e:
            logger.error(f"Error cancelling order {order_id}: {e}")
            return False
    
    def _validate_order(self, order: Order) -> bool:
        """Validate order parameters"""
        if not order.symbol or order.quantity <= 0:
            return False
        
        if order.order_type == OrderType.LIMIT and (not order.price or order.price <= 0):
            return False
        
        if order.order_type == OrderType.STOP and (not order.stop_price or order.stop_price <= 0):
            return False
        
        return True
    
    def _should_retry_error(self, error_message: str) -> bool:
        """Determine if error is retryable"""
        retryable_errors = [
            'rate limit', 'insufficient balance', 'market closed',
            'order book temporarily unavailable', 'network timeout'
        ]
        
        error_lower = error_message.lower()
        return any(retry_error in error_lower for retry_error in retryable_errors)
    
    async def _get_volume_profile(self, symbol: str, lookback_minutes: int = 30) -> Dict[float, float]:
        """Get volume profile for VWAP execution"""
        try:
            # Get recent order book data
            orderbook = await self.exchange_client.get_orderbook(symbol, depth=20)
            
            if not orderbook or not orderbook.get('bids') or not orderbook.get('asks'):
                return {}
            
            volume_profile = {}
            
            # Process bids (buy orders)
            for price, volume in orderbook['bids']:
                volume_profile[float(price)] = volume_profile.get(float(price), 0) + volume
            
            # Process asks (sell orders)
            for price, volume in orderbook['asks']:
                volume_profile[float(price)] = volume_profile.get(float(price), 0) + volume
            
            return volume_profile
            
        except Exception as e:
            logger.error(f"Error getting volume profile for {symbol}: {e}")
            return {}
    
    async def _notify_callbacks(self, order: Order):
        """Notify registered callbacks"""
        if order.client_order_id in self.execution_callbacks:
            for callback in self.execution_callbacks[order.client_order_id]:
                try:
                    await callback(order)
                except Exception as e:
                    logger.error(f"Error in execution callback: {e}")
    
    def register_callback(self, client_order_id: str, callback: Callable):
        """Register callback for order updates"""
        if client_order_id not in self.execution_callbacks:
            self.execution_callbacks[client_order_id] = []
        self.execution_callbacks[client_order_id].append(callback)
    
    def get_order_status(self, order_id: str) -> Optional[Order]:
        """Get current order status"""
        return self.pending_orders.get(order_id)
    
    def get_pending_orders(self) -> List[Order]:
        """Get all pending orders"""
        return [order for order in self.pending_orders.values() 
                if order.status in [OrderStatus.PENDING, OrderStatus.SUBMITTED, OrderStatus.PARTIAL_FILLED]]
    
    def cleanup_completed_orders(self):
        """Remove completed orders from pending list"""
        completed_orders = [
            order_id for order_id, order in self.pending_orders.items()
            if order.status in [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.EXPIRED]
        ]
        
        for order_id in completed_orders:
            order = self.pending_orders.pop(order_id)
            self.order_history.append(order)
        
        if completed_orders:
            logger.info(f"Cleaned up {len(completed_orders)} completed orders")

class RateLimiter:
    """Simple rate limiter for API calls"""
    
    def __init__(self, max_requests_per_second: int = 10):
        self.max_requests = max_requests_per_second
        self.requests = []
    
    async def acquire(self):
        """Acquire rate limit"""
        now = time.time()
        
        # Remove old requests
        self.requests = [req_time for req_time in self.requests if now - req_time < 1.0]
        
        # Check if we can make a request
        if len(self.requests) >= self.max_requests:
            sleep_time = 1.0 - (now - self.requests[0])
            await asyncio.sleep(sleep_time)
            return await self.acquire()
        
        self.requests.append(now)
        return True
