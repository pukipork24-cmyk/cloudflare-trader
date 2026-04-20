"""Security and secrets validation utilities"""
import os
import logging
import hmac
import hashlib
import secrets
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import asyncio
import signal
import sys

logger = logging.getLogger(__name__)

class SecurityValidator:
    """Validates and manages API keys and security settings"""
    
    REQUIRED_ENV_VARS = {
        'BITGET_API_KEY': {
            'description': 'Bitget API key for trading',
            'min_length': 32,
            'pattern': r'^[a-zA-Z0-9]{32,}$'
        },
        'BITGET_SECRET_KEY': {
            'description': 'Bitget API secret key',
            'min_length': 32,
            'pattern': r'^[a-zA-Z0-9]{32,}$'
        },
        'BITGET_PASSPHRASE': {
            'description': 'Bitget API passphrase',
            'min_length': 8,
            'pattern': r'^[a-zA-Z0-9]{8,}$'
        },
        'GROQ_API_KEY': {
            'description': 'Groq API key for AI models',
            'min_length': 40,
            'pattern': r'^gsk_[a-zA-Z0-9]{40,}$'
        },
        'DATABASE_URL': {
            'description': 'PostgreSQL database connection string',
            'min_length': 20,
            'pattern': r'^postgresql://'
        },
        'REDIS_URL': {
            'description': 'Redis connection string',
            'min_length': 10,
            'pattern': r'^redis://'
        }
    }
    
    OPTIONAL_ENV_VARS = {
        'TELEGRAM_BOT_TOKEN': {
            'description': 'Telegram bot token for alerts',
            'min_length': 20,
            'pattern': r'^[0-9]{8,10}:[a-zA-Z0-9_-]{35,}$'
        },
        'TELEGRAM_CHAT_ID': {
            'description': 'Telegram chat ID for alerts',
            'min_length': 8,
            'pattern': r'^-?\d+$'
        },
        'WHALE_ALERT_API_KEY': {
            'description': 'Whale Alert API key',
            'min_length': 32,
            'pattern': r'^[a-zA-Z0-9]{32,}$'
        },
        'ETHERSCAN_API_KEY': {
            'description': 'Etherscan API key',
            'min_length': 32,
            'pattern': r'^[a-zA-Z0-9]{32,}$'
        }
    }
    
    def __init__(self):
        self.validation_cache: Dict[str, Tuple[bool, str, datetime]] = {}
        self.cache_duration_hours = 24
    
    def validate_all_required(self) -> Tuple[bool, List[str]]:
        """Validate all required environment variables"""
        missing_vars = []
        invalid_vars = []
        
        for var_name, config in self.REQUIRED_ENV_VARS.items():
            value = os.getenv(var_name)
            
            if not value:
                missing_vars.append(f"{var_name}: {config['description']}")
                continue
            
            is_valid, error_msg = self._validate_single_var(var_name, value, config)
            if not is_valid:
                invalid_vars.append(f"{var_name}: {error_msg}")
        
        all_valid = len(missing_vars) == 0 and len(invalid_vars) == 0
        
        if not all_valid:
            error_messages = []
            if missing_vars:
                error_messages.append("Missing required environment variables:")
                error_messages.extend(f"  • {msg}" for msg in missing_vars)
            if invalid_vars:
                error_messages.append("Invalid environment variables:")
                error_messages.extend(f"  • {msg}" for msg in invalid_vars)
            
            logger.error("Security validation failed:\n" + "\n".join(error_messages))
        
        return all_valid, missing_vars + invalid_vars
    
    def validate_optional(self) -> Dict[str, Tuple[bool, str]]:
        """Validate optional environment variables"""
        results = {}
        
        for var_name, config in self.OPTIONAL_ENV_VARS.items():
            value = os.getenv(var_name)
            
            if not value:
                results[var_name] = (True, "Not configured (optional)")
                continue
            
            is_valid, error_msg = self._validate_single_var(var_name, value, config)
            results[var_name] = (is_valid, error_msg if not is_valid else "Valid")
        
        return results
    
    def _validate_single_var(self, var_name: str, value: str, config: Dict) -> Tuple[bool, str]:
        """Validate a single environment variable"""
        # Check cache
        cache_key = f"{var_name}:{value[:10]}"
        if cache_key in self.validation_cache:
            cached_result, cached_msg, cached_time = self.validation_cache[cache_key]
            if datetime.now() - cached_time < timedelta(hours=self.cache_duration_hours):
                return cached_result, cached_msg
        
        # Perform validation
        try:
            # Length check
            if len(value) < config['min_length']:
                result = (False, f"Too short (min {config['min_length']} characters)")
            
            # Pattern check
            elif 'pattern' in config:
                import re
                if not re.match(config['pattern'], value):
                    result = (False, "Invalid format")
                else:
                    result = (True, "Valid")
            else:
                result = (True, "Valid")
            
            # Cache result
            self.validation_cache[cache_key] = (result[0], result[1], datetime.now())
            
            return result
            
        except Exception as e:
            error_msg = f"Validation error: {str(e)}"
            self.validation_cache[cache_key] = (False, error_msg, datetime.now())
            return False, error_msg
    
    def generate_secure_key(self, length: int = 32) -> str:
        """Generate cryptographically secure random key"""
        return secrets.token_urlsafe(length)
    
    def hash_api_secret(self, secret: str, salt: str = None) -> str:
        """Hash API secret for storage"""
        if salt is None:
            salt = os.getenv('API_SALT', 'default_salt_change_me')
        
        return hashlib.pbkdf2_hmac(
            'sha256',
            secret.encode(),
            salt.encode(),
            100000,  # iterations
            dklen=32
        ).hex()
    
    def verify_api_secret(self, secret: str, hashed_secret: str, salt: str = None) -> bool:
        """Verify API secret against stored hash"""
        if salt is None:
            salt = os.getenv('API_SALT', 'default_salt_change_me')
        
        computed_hash = self.hash_api_secret(secret, salt)
        return hmac.compare_digest(computed_hash, hashed_secret)
    
    def get_security_summary(self) -> Dict:
        """Get security configuration summary"""
        summary = {
            'validation_timestamp': datetime.now().isoformat(),
            'required_vars_configured': 0,
            'required_vars_total': len(self.REQUIRED_ENV_VARS),
            'optional_vars_configured': 0,
            'optional_vars_total': len(self.OPTIONAL_ENV_VARS),
            'security_issues': [],
            'recommendations': []
        }
        
        # Check required vars
        for var_name in self.REQUIRED_ENV_VARS.keys():
            if os.getenv(var_name):
                summary['required_vars_configured'] += 1
            else:
                summary['security_issues'].append(f"Missing required: {var_name}")
        
        # Check optional vars
        for var_name in self.OPTIONAL_ENV_VARS.keys():
            if os.getenv(var_name):
                summary['optional_vars_configured'] += 1
        
        # Add recommendations
        if summary['required_vars_configured'] < summary['required_vars_total']:
            summary['recommendations'].append("Configure all required environment variables")
        
        if not os.getenv('API_SALT'):
            summary['recommendations'].append("Set API_SALT for enhanced security")
        
        if os.getenv('FLASK_ENV') == 'production':
            summary['recommendations'].append("Ensure all secrets are properly secured in production")
        
        return summary

class HeartbeatMonitor:
    """Monitor system health and restart dead processes"""
    
    def __init__(self):
        self.processes: Dict[str, Dict] = {}
        self.heartbeat_interval = 30  # seconds
        self.max_missed_heartbeats = 3
        self.is_running = False
        self.shutdown_event = asyncio.Event()
    
    def register_process(self, name: str, process_func, restart_func=None):
        """Register a process to monitor"""
        self.processes[name] = {
            'process_func': process_func,
            'restart_func': restart_func,
            'last_heartbeat': datetime.now(),
            'missed_heartbeats': 0,
            'is_running': False,
            'restart_count': 0
        }
        logger.info(f"Registered process for monitoring: {name}")
    
    async def send_heartbeat(self, process_name: str):
        """Send heartbeat for a process"""
        if process_name in self.processes:
            self.processes[process_name]['last_heartbeat'] = datetime.now()
            self.processes[process_name]['missed_heartbeats'] = 0
    
    async def start_monitoring(self):
        """Start the heartbeat monitoring loop"""
        self.is_running = True
        logger.info("Heartbeat monitoring started")
        
        while self.is_running and not self.shutdown_event.is_set():
            try:
                await self._check_processes()
                await asyncio.sleep(self.heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat monitoring: {e}")
                await asyncio.sleep(5)
        
        logger.info("Heartbeat monitoring stopped")
    
    async def _check_processes(self):
        """Check all registered processes"""
        current_time = datetime.now()
        
        for name, process_info in self.processes.items():
            time_since_heartbeat = (current_time - process_info['last_heartbeat']).total_seconds()
            
            if time_since_heartbeat > self.heartbeat_interval * self.max_missed_heartbeats:
                process_info['missed_heartbeats'] += 1
                
                if process_info['missed_heartbeats'] >= self.max_missed_heartbeats:
                    logger.warning(f"Process {name} missed {process_info['missed_heartbeats']} heartbeats - attempting restart")
                    
                    if process_info['restart_func']:
                        try:
                            await process_info['restart_func']()
                            process_info['restart_count'] += 1
                            process_info['missed_heartbeats'] = 0
                            process_info['last_heartbeat'] = current_time
                            logger.info(f"Process {name} restarted successfully")
                        except Exception as e:
                            logger.error(f"Failed to restart process {name}: {e}")
                    else:
                        logger.error(f"No restart function available for process {name}")
    
    def stop_monitoring(self):
        """Stop heartbeat monitoring"""
        self.is_running = False
        self.shutdown_event.set()
    
    def get_process_status(self) -> Dict[str, Dict]:
        """Get status of all monitored processes"""
        current_time = datetime.now()
        status = {}
        
        for name, process_info in self.processes.items():
            time_since_heartbeat = (current_time - process_info['last_heartbeat']).total_seconds()
            is_healthy = time_since_heartbeat < self.heartbeat_interval * self.max_missed_heartbeats
            
            status[name] = {
                'is_healthy': is_healthy,
                'last_heartbeat': process_info['last_heartbeat'].isoformat(),
                'missed_heartbeats': process_info['missed_heartbeats'],
                'restart_count': process_info['restart_count'],
                'time_since_heartbeat': time_since_heartbeat
            }
        
        return status

class GracefulShutdown:
    """Handle graceful shutdown of trading system"""
    
    def __init__(self):
        self.shutdown_handlers = []
        self.is_shutting_down = False
        self.shutdown_timeout = 30  # seconds
        
        # Register signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        if hasattr(signal, 'SIGQUIT'):
            signal.signal(signal.SIGQUIT, self._signal_handler)
    
    def register_handler(self, handler_func, priority: int = 0):
        """Register a shutdown handler function"""
        self.shutdown_handlers.append((priority, handler_func))
        # Sort by priority (higher priority first)
        self.shutdown_handlers.sort(key=lambda x: x[0], reverse=True)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        if self.is_shutting_down:
            logger.warning("Shutdown already in progress")
            return
        
        logger.info(f"Received shutdown signal {signum}, initiating graceful shutdown")
        self.is_shutting_down = True
        
        # Run shutdown handlers
        asyncio.create_task(self._execute_shutdown_handlers())
    
    async def _execute_shutdown_handlers(self):
        """Execute all registered shutdown handlers"""
        logger.info("Executing graceful shutdown handlers")
        
        for priority, handler in self.shutdown_handlers:
            try:
                logger.info(f"Running shutdown handler (priority {priority})")
                
                # Run handler with timeout
                try:
                    await asyncio.wait_for(handler(), timeout=self.shutdown_timeout)
                except asyncio.TimeoutError:
                    logger.warning(f"Shutdown handler timed out after {self.shutdown_timeout} seconds")
                except Exception as e:
                    logger.error(f"Error in shutdown handler: {e}")
                
            except Exception as e:
                logger.error(f"Failed to execute shutdown handler: {e}")
        
        logger.info("Graceful shutdown completed")
        sys.exit(0)
    
    async def force_shutdown(self, reason: str = "Manual force shutdown"):
        """Force immediate shutdown"""
        logger.critical(f"Force shutdown initiated: {reason}")
        self.is_shutting_down = True
        await self._execute_shutdown_handlers()

class DockerHealthChecker:
    """Docker health check utilities"""
    
    @staticmethod
    def create_health_check_app():
        """Create Flask app for Docker health checks"""
        from flask import Flask, jsonify
        
        app = Flask(__name__)
        
        @app.route('/health')
        def health_check():
            """Main health check endpoint"""
            try:
                # Check database connection
                from models.database import db
                db.session.execute('SELECT 1')
                db_status = "healthy"
            except Exception as e:
                db_status = f"unhealthy: {str(e)}"
            
            # Check Redis connection
            try:
                from orchestrator.redis_broker import broker
                if broker.redis and broker.redis.ping():
                    redis_status = "healthy"
                else:
                    redis_status = "unhealthy: no connection"
            except Exception as e:
                redis_status = f"unhealthy: {str(e)}"
            
            # Check trading system status
            try:
                from services.circuit_breaker import circuit_breaker
                trading_status = "paused" if circuit_breaker.is_paused() else "active"
            except Exception as e:
                trading_status = f"error: {str(e)}"
            
            overall_status = "healthy" if all([
                "healthy" in db_status,
                "healthy" in redis_status,
                "error" not in trading_status
            ]) else "unhealthy"
            
            return jsonify({
                "status": overall_status,
                "timestamp": datetime.now().isoformat(),
                "checks": {
                    "database": db_status,
                    "redis": redis_status,
                    "trading_system": trading_status
                }
            })
        
        @app.route('/ready')
        def readiness_check():
            """Readiness check endpoint"""
            # Check if system is ready to trade
            try:
                from services.circuit_breaker import circuit_breaker
                from core.utils.security import SecurityValidator
                
                validator = SecurityValidator()
                security_valid, _ = validator.validate_all_required()
                
                is_ready = (
                    security_valid and
                    not circuit_breaker.is_paused()
                )
                
                return jsonify({
                    "status": "ready" if is_ready else "not_ready",
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                return jsonify({
                    "status": "not_ready",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }), 500
        
        return app

# Global instances
security_validator = SecurityValidator()
heartbeat_monitor = HeartbeatMonitor()
graceful_shutdown = GracefulShutdown()
