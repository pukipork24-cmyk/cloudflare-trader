"""Real-time WebSocket feed handler for market data"""
import asyncio
import websockets
import json
import logging
from typing import Dict, List, Callable, Optional
from datetime import datetime
import pandas as pd
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class FeedType(Enum):
    TRADES = "trades"
    ORDERBOOK = "orderbook"
    KLINE = "kline"
    TICKER = "ticker"

@dataclass
class MarketData:
    symbol: str
    timestamp: datetime
    price: float
    volume: float
    side: Optional[str] = None  # buy/sell for trades
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    close: Optional[float] = None
    feed_type: FeedType = FeedType.TICKER

class WebSocketFeedHandler:
    """Real-time WebSocket feed handler for multiple exchanges"""
    
    def __init__(self):
        self.connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.subscribers: Dict[str, List[Callable]] = {}
        self.data_buffer: Dict[str, List[MarketData]] = {}
        self.is_running = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        
        # Exchange endpoints
        self.binance_ws_url = "wss://stream.binance.com:9443/ws"
        self.bitget_ws_url = "wss://ws.bitget.com/spot/v1/stream"
        
    async def subscribe_to_binance(self, symbols: List[str], streams: List[str]):
        """Subscribe to Binance WebSocket streams"""
        try:
            # Build stream URLs
            stream_names = []
            for symbol in symbols:
                symbol_lower = symbol.lower()
                for stream in streams:
                    if stream == "ticker":
                        stream_names.append(f"{symbol_lower}@ticker")
                    elif stream == "kline_1m":
                        stream_names.append(f"{symbol_lower}@kline_1m")
                    elif stream == "depth":
                        stream_names.append(f"{symbol_lower}@depth5@100ms")
                    elif stream == "trade":
                        stream_names.append(f"{symbol_lower}@trade")
            
            stream_url = f"{self.binance_ws_url}/{'/'.join(stream_names)}"
            
            async with websockets.connect(stream_url) as websocket:
                self.connections["binance"] = websocket
                logger.info(f"Connected to Binance WebSocket for {len(stream_names)} streams")
                self.reconnect_attempts = 0
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self._process_binance_message(data)
                    except Exception as e:
                        logger.error(f"Error processing Binance message: {e}")
                        
        except Exception as e:
            logger.error(f"Binance WebSocket connection error: {e}")
            await self._handle_reconnect("binance", symbols, streams)
    
    async def subscribe_to_bitget(self, symbols: List[str], streams: List[str]):
        """Subscribe to Bitget WebSocket streams"""
        try:
            async with websockets.connect(self.bitget_ws_url) as websocket:
                self.connections["bitget"] = websocket
                logger.info(f"Connected to Bitget WebSocket for {len(symbols)} symbols")
                self.reconnect_attempts = 0
                
                # Subscribe to streams
                for symbol in symbols:
                    for stream in streams:
                        subscribe_msg = {
                            "op": "subscribe",
                            "args": [{
                                "instType": "SPOT",
                                "channel": stream,
                                "instId": symbol
                            }]
                        }
                        await websocket.send(json.dumps(subscribe_msg))
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        await self._process_bitget_message(data)
                    except Exception as e:
                        logger.error(f"Error processing Bitget message: {e}")
                        
        except Exception as e:
            logger.error(f"Bitget WebSocket connection error: {e}")
            await self._handle_reconnect("bitget", symbols, streams)
    
    async def _process_binance_message(self, data: dict):
        """Process Binance WebSocket message"""
        try:
            if 'stream' in data:
                stream = data['stream']
                payload = data['data']
                
                if 'ticker' in stream:
                    # Ticker data
                    market_data = MarketData(
                        symbol=payload['s'],
                        timestamp=datetime.fromtimestamp(payload['E'] / 1000),
                        price=float(payload['c']),
                        volume=float(payload['v']),
                        high=float(payload['h']),
                        low=float(payload['l']),
                        open=float(payload['o']),
                        close=float(payload['c']),
                        feed_type=FeedType.TICKER
                    )
                    await self._notify_subscribers(market_data)
                    
                elif 'kline' in stream:
                    # Kline data
                    kline = payload['k']
                    if kline['x']:  # Kline closed
                        market_data = MarketData(
                            symbol=kline['s'],
                            timestamp=datetime.fromtimestamp(kline['t'] / 1000),
                            price=float(kline['c']),
                            volume=float(kline['v']),
                            high=float(kline['h']),
                            low=float(kline['l']),
                            open=float(kline['o']),
                            close=float(kline['c']),
                            feed_type=FeedType.KLINE
                        )
                        await self._notify_subscribers(market_data)
                        
                elif 'trade' in stream:
                    # Trade data
                    market_data = MarketData(
                        symbol=payload['s'],
                        timestamp=datetime.fromtimestamp(payload['T'] / 1000),
                        price=float(payload['p']),
                        volume=float(payload['q']),
                        side='buy' if payload['m'] else 'sell',
                        feed_type=FeedType.TRADES
                    )
                    await self._notify_subscribers(market_data)
                    
        except Exception as e:
            logger.error(f"Error processing Binance message: {e}")
    
    async def _process_bitget_message(self, data: dict):
        """Process Bitget WebSocket message"""
        try:
            if data.get('event') == 'subscribe':
                logger.info(f"Subscribed to {data.get('arg')}")
                return
                
            if 'data' in data:
                arg = data.get('arg', {})
                payload = data['data']
                channel = arg.get('channel')
                symbol = arg.get('instId')
                
                if channel == 'tickers':
                    if isinstance(payload, list) and payload:
                        ticker = payload[0]
                        market_data = MarketData(
                            symbol=symbol,
                            timestamp=datetime.now(),
                            price=float(ticker['lastPr']),
                            volume=float(ticker['base24hVol']),
                            high=float(ticker['high24h']),
                            low=float(ticker['low24h']),
                            open=float(ticker['open24h']),
                            close=float(ticker['lastPr']),
                            feed_type=FeedType.TICKER
                        )
                        await self._notify_subscribers(market_data)
                        
        except Exception as e:
            logger.error(f"Error processing Bitget message: {e}")
    
    async def _notify_subscribers(self, market_data: MarketData):
        """Notify all subscribers of new market data"""
        # Buffer data
        if market_data.symbol not in self.data_buffer:
            self.data_buffer[market_data.symbol] = []
        
        self.data_buffer[market_data.symbol].append(market_data)
        
        # Keep buffer size manageable
        if len(self.data_buffer[market_data.symbol]) > 1000:
            self.data_buffer[market_data.symbol] = self.data_buffer[market_data.symbol][-500:]
        
        # Notify subscribers
        if market_data.symbol in self.subscribers:
            for callback in self.subscribers[market_data.symbol]:
                try:
                    await callback(market_data)
                except Exception as e:
                    logger.error(f"Error in subscriber callback: {e}")
    
    def subscribe(self, symbol: str, callback: Callable):
        """Subscribe to market data for a symbol"""
        if symbol not in self.subscribers:
            self.subscribers[symbol] = []
        self.subscribers[symbol].append(callback)
        logger.info(f"Added subscriber for {symbol}")
    
    def unsubscribe(self, symbol: str, callback: Callable):
        """Unsubscribe from market data for a symbol"""
        if symbol in self.subscribers and callback in self.subscribers[symbol]:
            self.subscribers[symbol].remove(callback)
            logger.info(f"Removed subscriber for {symbol}")
    
    def get_latest_data(self, symbol: str, limit: int = 100) -> List[MarketData]:
        """Get latest market data for a symbol"""
        if symbol in self.data_buffer:
            return self.data_buffer[symbol][-limit:]
        return []
    
    def get_ohlcv_data(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        """Get OHLCV data as pandas DataFrame"""
        data = self.get_latest_data(symbol, limit)
        if not data:
            return pd.DataFrame()
        
        # Filter for kline data
        ohlcv_data = [d for d in data if d.feed_type == FeedType.KLINE]
        
        if not ohlcv_data:
            return pd.DataFrame()
        
        df_data = [{
            'timestamp': d.timestamp,
            'open': d.open,
            'high': d.high,
            'low': d.low,
            'close': d.close,
            'volume': d.volume
        } for d in ohlcv_data]
        
        df = pd.DataFrame(df_data)
        df.set_index('timestamp', inplace=True)
        return df.sort_index()
    
    async def _handle_reconnect(self, exchange: str, symbols: List[str], streams: List[str]):
        """Handle WebSocket reconnection with exponential backoff"""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            logger.error(f"Max reconnection attempts reached for {exchange}")
            return
        
        self.reconnect_attempts += 1
        backoff_time = min(2 ** self.reconnect_attempts, 30)  # Max 30 seconds
        
        logger.info(f"Reconnecting to {exchange} in {backoff_time} seconds (attempt {self.reconnect_attempts})")
        await asyncio.sleep(backoff_time)
        
        if exchange == "binance":
            await self.subscribe_to_binance(symbols, streams)
        elif exchange == "bitget":
            await self.subscribe_to_bitget(symbols, streams)
    
    async def start(self, symbols: List[str], exchanges: List[str] = ["binance"], 
                   streams: List[str] = ["ticker", "kline_1m"]):
        """Start WebSocket feeds"""
        self.is_running = True
        logger.info(f"Starting WebSocket feeds for {symbols} on {exchanges}")
        
        tasks = []
        for exchange in exchanges:
            if exchange == "binance":
                tasks.append(self.subscribe_to_binance(symbols, streams))
            elif exchange == "bitget":
                tasks.append(self.subscribe_to_bitget(symbols, streams))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def stop(self):
        """Stop all WebSocket connections"""
        self.is_running = False
        logger.info("Stopping WebSocket connections")
        
        for connection in self.connections.values():
            try:
                await connection.close()
            except Exception as e:
                logger.error(f"Error closing connection: {e}")
        
        self.connections.clear()
        self.subscribers.clear()
        self.data_buffer.clear()

# Global feed handler instance
feed_handler = WebSocketFeedHandler()
