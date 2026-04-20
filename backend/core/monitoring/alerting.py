"""Telegram bot alerting system for trading events"""
import asyncio
import logging
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class AlertLevel(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class AlertType(Enum):
    TRADE_OPENED = "TRADE_OPENED"
    TRADE_CLOSED = "TRADE_CLOSED"
    DRAWDOWN_LIMIT = "DRAWDOWN_LIMIT"
    KILL_SWITCH = "KILL_SWITCH"
    MODEL_ANOMALY = "MODEL_ANOMALY"
    SYSTEM_ERROR = "SYSTEM_ERROR"
    RISK_BREACH = "RISK_BREACH"

@dataclass
class Alert:
    alert_type: AlertType
    level: AlertLevel
    message: str
    symbol: Optional[str] = None
    data: Optional[Dict] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

class TelegramAlertBot:
    """Telegram bot for real-time alerts"""
    
    def __init__(self, bot_token: str = None, chat_id: str = None):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.enabled = bool(bot_token and chat_id)
        self.alert_queue: List[Alert] = []
        self.rate_limit_seconds = 1  # Max 1 message per second
        self.last_message_time = 0
        
        # Alert subscriptions (which alerts to send)
        self.alert_subscriptions = {
            AlertType.TRADE_OPENED: True,
            AlertType.TRADE_CLOSED: True,
            AlertType.DRAWDOWN_LIMIT: True,
            AlertType.KILL_SWITCH: True,
            AlertType.MODEL_ANOMALY: True,
            AlertType.SYSTEM_ERROR: True,
            AlertType.RISK_BREACH: True
        }
        
        if self.enabled:
            logger.info("Telegram alert bot initialized")
        else:
            logger.warning("Telegram bot disabled - missing credentials")
    
    async def send_alert(self, alert: Alert) -> bool:
        """Send alert via Telegram"""
        if not self.enabled:
            return False
        
        # Check if this alert type is subscribed
        if not self.alert_subscriptions.get(alert.alert_type, False):
            return False
        
        # Rate limiting
        current_time = datetime.now().timestamp()
        if current_time - self.last_message_time < self.rate_limit_seconds:
            # Queue for later
            self.alert_queue.append(alert)
            return False
        
        try:
            # Format message
            message = self._format_alert(alert)
            
            # Send to Telegram
            success = await self._send_telegram_message(message)
            
            if success:
                self.last_message_time = current_time
                logger.info(f"Alert sent: {alert.alert_type.value} - {alert.message}")
                
                # Process queued alerts
                await self._process_queue()
            else:
                logger.error("Failed to send Telegram alert")
            
            return success
            
        except Exception as e:
            logger.error(f"Error sending alert: {e}")
            return False
    
    def _format_alert(self, alert: Alert) -> str:
        """Format alert message for Telegram"""
        # Emoji mapping
        emoji_map = {
            AlertLevel.INFO: "ℹ️",
            AlertLevel.WARNING: "⚠️",
            AlertLevel.ERROR: "❌",
            AlertLevel.CRITICAL: "🚨"
        }
        
        alert_type_emoji = {
            AlertType.TRADE_OPENED: "📈",
            AlertType.TRADE_CLOSED: "📊",
            AlertType.DRAWDOWN_LIMIT: "📉",
            AlertType.KILL_SWITCH: "🛑",
            AlertType.MODEL_ANOMALY: "🤖",
            AlertType.SYSTEM_ERROR: "⚙️",
            AlertType.RISK_BREACH: "⚡"
        }
        
        level_emoji = emoji_map.get(alert.level, "")
        type_emoji = alert_type_emoji.get(alert.alert_type, "")
        
        # Build message
        lines = [
            f"{level_emoji} {alert.level.value}",
            f"{type_emoji} {alert.alert_type.value}",
            f"🕐 {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}",
            ""
        ]
        
        if alert.symbol:
            lines.append(f"📊 Symbol: {alert.symbol}")
        
        lines.append(f"📝 {alert.message}")
        
        # Add data if present
        if alert.data:
            lines.append("")
            lines.append("📊 Details:")
            for key, value in alert.data.items():
                if isinstance(value, (int, float)):
                    lines.append(f"  • {key}: {value:,.2f}")
                else:
                    lines.append(f"  • {key}: {value}")
        
        return "\n".join(lines)
    
    async def _send_telegram_message(self, message: str) -> bool:
        """Send message to Telegram"""
        try:
            import aiohttp
            
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            payload = {
                'chat_id': self.chat_id,
                'text': message,
                'parse_mode': 'HTML',
                'disable_web_page_preview': True
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=10) as response:
                    if response.status == 200:
                        result = await response.json()
                        return result.get('ok', False)
                    else:
                        logger.error(f"Telegram API error: {response.status}")
                        return False
                        
        except ImportError:
            logger.error("aiohttp not installed - pip install aiohttp")
            return False
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
            return False
    
    async def _process_queue(self):
        """Process queued alerts"""
        while self.alert_queue:
            alert = self.alert_queue.pop(0)
            await asyncio.sleep(self.rate_limit_seconds)
            await self.send_alert(alert)
    
    async def send_trade_alert(self, symbol: str, side: str, quantity: float, 
                            price: float, order_type: str = "OPEN"):
        """Send trade execution alert"""
        if order_type == "OPEN":
            alert_type = AlertType.TRADE_OPENED
            message = f"Position opened: {side} {quantity:.6f} {symbol} @ ${price:.4f}"
        else:
            alert_type = AlertType.TRADE_CLOSED
            message = f"Position closed: {side} {quantity:.6f} {symbol} @ ${price:.4f}"
        
        alert = Alert(
            alert_type=alert_type,
            level=AlertLevel.INFO,
            message=message,
            symbol=symbol,
            data={
                'side': side,
                'quantity': quantity,
                'price': price,
                'value': quantity * price
            }
        )
        
        return await self.send_alert(alert)
    
    async def send_drawdown_alert(self, current_drawdown: float, 
                                max_drawdown: float, threshold: float):
        """Send drawdown limit alert"""
        if current_drawdown < threshold:
            return
        
        alert = Alert(
            alert_type=AlertType.DRAWDOWN_LIMIT,
            level=AlertLevel.WARNING if current_drawdown < threshold * 1.5 else AlertLevel.CRITICAL,
            message=f"Drawdown limit breached: {current_drawdown:.1f}% (max: {max_drawdown:.1f}%)",
            data={
                'current_drawdown': current_drawdown,
                'max_drawdown': max_drawdown,
                'threshold': threshold
            }
        )
        
        return await self.send_alert(alert)
    
    async def send_kill_switch_alert(self, reason: str, positions_closed: int = 0):
        """Send kill switch activation alert"""
        alert = Alert(
            alert_type=AlertType.KILL_SWITCH,
            level=AlertLevel.CRITICAL,
            message=f"🛑 KILL SWITCH ACTIVATED: {reason}",
            data={
                'reason': reason,
                'positions_closed': positions_closed,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        return await self.send_alert(alert)
    
    async def send_model_anomaly_alert(self, model_name: str, anomaly_type: str, 
                                    confidence: float, expected_range: tuple):
        """Send model anomaly alert"""
        alert = Alert(
            alert_type=AlertType.MODEL_ANOMALY,
            level=AlertLevel.WARNING,
            message=f"Model anomaly detected: {model_name} - {anomaly_type}",
            data={
                'model': model_name,
                'anomaly_type': anomaly_type,
                'confidence': confidence,
                'expected_range': f"{expected_range[0]:.3f} to {expected_range[1]:.3f}"
            }
        )
        
        return await self.send_alert(alert)
    
    async def send_system_error_alert(self, error_message: str, component: str = None):
        """Send system error alert"""
        alert = Alert(
            alert_type=AlertType.SYSTEM_ERROR,
            level=AlertLevel.ERROR,
            message=f"System error in {component or 'Unknown'}: {error_message}",
            data={
                'component': component,
                'error': error_message,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        return await self.send_alert(alert)
    
    async def send_risk_breach_alert(self, risk_type: str, current_value: float, 
                                    limit_value: float, symbol: str = None):
        """Send risk breach alert"""
        alert = Alert(
            alert_type=AlertType.RISK_BREACH,
            level=AlertLevel.WARNING,
            message=f"Risk limit breached: {risk_type} = {current_value:.2f} (limit: {limit_value:.2f})",
            symbol=symbol,
            data={
                'risk_type': risk_type,
                'current_value': current_value,
                'limit_value': limit_value
            }
        )
        
        return await self.send_alert(alert)
    
    def subscribe_alert_type(self, alert_type: AlertType, enabled: bool = True):
        """Subscribe/unsubscribe to specific alert types"""
        self.alert_subscriptions[alert_type] = enabled
        logger.info(f"Alert subscription updated: {alert_type.value} -> {enabled}")
    
    def get_alert_subscriptions(self) -> Dict[AlertType, bool]:
        """Get current alert subscriptions"""
        return self.alert_subscriptions.copy()
    
    async def test_connection(self) -> bool:
        """Test Telegram bot connection"""
        if not self.enabled:
            return False
        
        try:
            test_alert = Alert(
                alert_type=AlertType.INFO,
                level=AlertLevel.INFO,
                message="🤖 Trading bot alert system test - connection successful"
            )
            
            return await self.send_alert(test_alert)
            
        except Exception as e:
            logger.error(f"Telegram connection test failed: {e}")
            return False

class StructuredLogger:
    """Structured JSON logging with log levels per module"""
    
    def __init__(self, module_name: str):
        self.module_name = module_name
        self.logger = logging.getLogger(module_name)
    
    def _log_structured(self, level: str, message: str, data: Dict = None):
        """Create structured log entry"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'level': level,
            'module': self.module_name,
            'message': message
        }
        
        if data:
            log_entry['data'] = data
        
        # Log as JSON string
        import json
        json_message = json.dumps(log_entry)
        
        if level == 'DEBUG':
            self.logger.debug(json_message)
        elif level == 'INFO':
            self.logger.info(json_message)
        elif level == 'WARNING':
            self.logger.warning(json_message)
        elif level == 'ERROR':
            self.logger.error(json_message)
        elif level == 'CRITICAL':
            self.logger.critical(json_message)
    
    def debug(self, message: str, data: Dict = None):
        self._log_structured('DEBUG', message, data)
    
    def info(self, message: str, data: Dict = None):
        self._log_structured('INFO', message, data)
    
    def warning(self, message: str, data: Dict = None):
        self._log_structured('WARNING', message, data)
    
    def error(self, message: str, data: Dict = None):
        self._log_structured('ERROR', message, data)
    
    def critical(self, message: str, data: Dict = None):
        self._log_structured('CRITICAL', message, data)

class AnomalyDetector:
    """Detect anomalies in model outputs"""
    
    def __init__(self, lookback_periods: int = 100):
        self.lookback_periods = lookback_periods
        self.historical_data: Dict[str, List[float]] = {}
        self.threshold_zscore = 3.0  # 3 standard deviations
    
    def add_observation(self, metric_name: str, value: float):
        """Add new observation for anomaly detection"""
        if metric_name not in self.historical_data:
            self.historical_data[metric_name] = []
        
        self.historical_data[metric_name].append(value)
        
        # Keep only recent data
        if len(self.historical_data[metric_name]) > self.lookback_periods:
            self.historical_data[metric_name] = self.historical_data[metric_name][-self.lookback_periods:]
    
    def detect_anomaly(self, metric_name: str, current_value: float) -> Tuple[bool, float, str]:
        """Detect if current value is anomalous"""
        if metric_name not in self.historical_data or len(self.historical_data[metric_name]) < 10:
            return False, 0.0, "Insufficient historical data"
        
        historical_values = self.historical_data[metric_name]
        
        # Calculate statistics
        mean = sum(historical_values) / len(historical_values)
        variance = sum((x - mean) ** 2 for x in historical_values) / len(historical_values)
        std_dev = variance ** 0.5
        
        if std_dev == 0:
            return False, 0.0, "No variance in historical data"
        
        # Calculate Z-score
        z_score = abs(current_value - mean) / std_dev
        
        # Check threshold
        is_anomaly = z_score > self.threshold_zscore
        
        if is_anomaly:
            anomaly_type = "High" if current_value > mean else "Low"
            return True, z_score, f"{anomaly} value detected (Z-score: {z_score:.2f})"
        
        return False, z_score, "Normal"
    
    def get_statistics(self, metric_name: str) -> Dict:
        """Get statistics for a metric"""
        if metric_name not in self.historical_data or len(self.historical_data[metric_name]) == 0:
            return {}
        
        values = self.historical_data[metric_name]
        
        return {
            'count': len(values),
            'mean': sum(values) / len(values),
            'min': min(values),
            'max': max(values),
            'std_dev': (sum((x - sum(values)/len(values)) ** 2 for x in values) / len(values)) ** 0.5
        }

# Global instances
telegram_bot = TelegramAlertBot()
anomaly_detector = AnomalyDetector()
