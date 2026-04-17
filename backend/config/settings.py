"""Application configuration and settings"""
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""

    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
    DEBUG = os.getenv('FLASK_ENV', 'production') == 'development'

    # Database
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://trader:password@localhost:5432/tradingbot')
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Redis
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

    # Exchange (Bitget)
    BITGET_API_KEY = os.getenv('BITGET_API_KEY')
    BITGET_SECRET_KEY = os.getenv('BITGET_SECRET_KEY')
    BITGET_PASSPHRASE = os.getenv('BITGET_PASSPHRASE')
    BITGET_SANDBOX = os.getenv('BITGET_SANDBOX', 'false').lower() == 'true'

    # AI Models (Groq)
    GROQ_API_KEY = os.getenv('GROQ_API_KEY')
    GROQ_MODEL = 'mixtral-8x7b-32768'

    # Data Sources
    WHALE_ALERT_API_KEY = os.getenv('WHALE_ALERT_API_KEY')
    ETHERSCAN_API_KEY = os.getenv('ETHERSCAN_API_KEY')
    TELEGRAM_API_ID = os.getenv('TELEGRAM_API_ID')
    TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')
    TELEGRAM_PHONE = os.getenv('TELEGRAM_PHONE')

    # Trading Defaults
    DEFAULT_MAX_CONCURRENT_TRADES = int(os.getenv('DEFAULT_MAX_CONCURRENT_TRADES', 3))
    DEFAULT_PER_TRADE_RISK_PCT = float(os.getenv('DEFAULT_PER_TRADE_RISK_PCT', 2.0))
    DEFAULT_MAX_LEVERAGE = int(os.getenv('DEFAULT_MAX_LEVERAGE', 5))
    DEFAULT_MAX_PAIRS = int(os.getenv('DEFAULT_MAX_PAIRS', 10))
    CYCLE_INTERVAL_MINUTES = int(os.getenv('CYCLE_INTERVAL_MINUTES', 5))

    # Trading Safety
    TRADING_ENABLED = os.getenv('TRADING_ENABLED', 'false').lower() == 'true'
    PAPER_TRADING_MODE = os.getenv('PAPER_TRADING_MODE', 'true').lower() == 'true'

    # Backtesting
    BACKTEST_TRAIN_WINDOW_DAYS = 30
    BACKTEST_TEST_WINDOW_DAYS = 7
    BACKTEST_MIN_TRADES = 20
    BACKTEST_SHARPE_IMPROVEMENT_THRESHOLD = 0.05  # 5%

    # Circuit Breakers
    CIRCUIT_BREAKER_LOSS_THRESHOLD_PCT = 5.0
    CIRCUIT_BREAKER_CONSECUTIVE_LOSSES = 3
    CIRCUIT_BREAKER_PAUSE_HOURS = 6
    CIRCUIT_BREAKER_MAX_DRAWDOWN_PCT = 15.0

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_DIR = 'logs'

    # Auth
    ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@example.com')
    ADMIN_PASSWORD_HASH = os.getenv('ADMIN_PASSWORD_HASH')

    @staticmethod
    def validate():
        """Validate required config"""
        required = ['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'GROQ_API_KEY']
        missing = [k for k in required if not os.getenv(k)]
        if missing:
            raise ValueError(f"Missing required env vars: {', '.join(missing)}")
        return True

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    PAPER_TRADING_MODE = True
    TRADING_ENABLED = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
