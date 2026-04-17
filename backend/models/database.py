"""Database models and initialization"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid

db = SQLAlchemy()

class User(db.Model):
    """Admin user for authentication"""
    __tablename__ = 'users'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<User {self.email}>'

class TradeDecision(db.Model):
    """Aggregated AI recommendation"""
    __tablename__ = 'trade_decisions'

    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20), nullable=False)
    recommendation = db.Column(db.Enum('BUY', 'SELL', 'HOLD'), nullable=False)
    confidence = db.Column(db.Integer, nullable=False)  # 0-100
    risk_level = db.Column(db.Enum('LOW', 'MEDIUM', 'HIGH', 'EXTREME'), nullable=False)

    # Individual agent votes
    technical_rec = db.Column(db.String(50))
    technical_conf = db.Column(db.Integer)
    sentiment_rec = db.Column(db.String(50))
    sentiment_conf = db.Column(db.Integer)
    fundamental_rec = db.Column(db.String(50))
    fundamental_conf = db.Column(db.Integer)
    risk_rec = db.Column(db.String(50))
    risk_conf = db.Column(db.Integer)
    portfolio_rec = db.Column(db.String(50))
    portfolio_conf = db.Column(db.Integer)

    # Intelligence analysis
    intelligence_narrative = db.Column(db.Text)
    consensus_quality = db.Column(db.String(20))  # STRONG, MODERATE, WEAK
    red_flags = db.Column(db.JSON)  # []
    conflicts = db.Column(db.JSON)  # []

    # CIO approval
    cio_decision = db.Column(db.Enum('EXECUTE', 'SKIP', 'MODIFY'), nullable=False)
    cio_reasoning = db.Column(db.Text)

    # Trade parameters
    entry_zone = db.Column(db.String(100))
    stop_loss = db.Column(db.Numeric(20, 8))
    target = db.Column(db.Numeric(20, 8))
    timeframe = db.Column(db.String(50))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    trades = db.relationship('Trade', backref='decision', lazy=True)

    def __repr__(self):
        return f'<TradeDecision {self.symbol} {self.recommendation}>'

class Trade(db.Model):
    """Individual trade execution"""
    __tablename__ = 'trades'

    id = db.Column(db.Integer, primary_key=True)
    trade_decision_id = db.Column(db.Integer, db.ForeignKey('trade_decisions.id'))

    # Exchange reference
    bitget_order_id = db.Column(db.String(100), unique=True, nullable=False)

    # Position details
    coin = db.Column(db.String(20), nullable=False)
    direction = db.Column(db.Enum('BUY', 'SELL', 'SHORT'), nullable=False)
    trade_type = db.Column(db.Enum('SPOT', 'FUTURES'), default='SPOT')
    leverage = db.Column(db.Numeric(5, 2), default=1.00)
    quantity = db.Column(db.Numeric(20, 8), nullable=False)

    # Entry
    planned_entry_price = db.Column(db.Numeric(20, 8), nullable=False)
    actual_entry_price = db.Column(db.Numeric(20, 8))
    slippage_pct = db.Column(db.Numeric(8, 4))

    # Risk management
    stop_loss = db.Column(db.Numeric(20, 8), nullable=False)
    take_profit_1 = db.Column(db.Numeric(20, 8), nullable=False)
    take_profit_2 = db.Column(db.Numeric(20, 8))
    take_profit_3 = db.Column(db.Numeric(20, 8))

    # Exit tracking
    status = db.Column(db.Enum('OPEN', 'CLOSED', 'STOPPED', 'PARTIAL', 'LIQUIDATED'), default='OPEN')
    close_price = db.Column(db.Numeric(20, 8))
    close_reason = db.Column(db.Enum('TP1', 'TP2', 'TP3', 'SL', 'TIMEOUT', 'MANUAL', 'LIQUIDATED'))

    # Partial exits
    tp1_filled_qty = db.Column(db.Numeric(20, 8))
    tp1_filled_price = db.Column(db.Numeric(20, 8))
    tp1_filled_at = db.Column(db.DateTime)
    tp2_filled_qty = db.Column(db.Numeric(20, 8))
    tp2_filled_price = db.Column(db.Numeric(20, 8))
    tp2_filled_at = db.Column(db.DateTime)
    tp3_filled_qty = db.Column(db.Numeric(20, 8))
    tp3_filled_price = db.Column(db.Numeric(20, 8))
    tp3_filled_at = db.Column(db.DateTime)

    # P&L tracking
    pnl_usdt = db.Column(db.Numeric(20, 8))
    pnl_pct = db.Column(db.Numeric(10, 4))
    commission_usdt = db.Column(db.Numeric(20, 8), default=0)
    net_pnl_usdt = db.Column(db.Numeric(20, 8))
    roi_pct = db.Column(db.Numeric(10, 4))

    # Timing
    timeframe = db.Column(db.String(50))
    opened_at = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at = db.Column(db.DateTime)
    hold_duration_minutes = db.Column(db.Integer)

    # AI Analysis (explainability)
    agent_confidence = db.Column(db.Integer)
    risk_level = db.Column(db.Enum('LOW', 'MEDIUM', 'HIGH', 'EXTREME'))
    cio_decision = db.Column(db.String(50))

    # Full audit trail
    intelligence_brief = db.Column(db.JSON)
    agent_breakdown = db.Column(db.JSON)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<Trade {self.coin} {self.direction} {self.status}>'

class BacktestResult(db.Model):
    """Backtest execution results"""
    __tablename__ = 'backtest_results'

    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    strategy_name = db.Column(db.String(255))

    # Performance metrics
    total_trades = db.Column(db.Integer)
    winning_trades = db.Column(db.Integer)
    losing_trades = db.Column(db.Integer)
    win_rate = db.Column(db.Numeric(5, 2))  # %
    total_pnl_usdt = db.Column(db.Numeric(20, 8))
    total_commission_usdt = db.Column(db.Numeric(20, 8))
    net_pnl_usdt = db.Column(db.Numeric(20, 8))
    avg_trade_pnl = db.Column(db.Numeric(20, 8))
    largest_win = db.Column(db.Numeric(20, 8))
    largest_loss = db.Column(db.Numeric(20, 8))

    # Risk metrics
    sharpe_ratio = db.Column(db.Numeric(10, 4))
    max_drawdown_pct = db.Column(db.Numeric(10, 4))
    avg_hold_duration_hours = db.Column(db.Numeric(10, 2))
    profit_factor = db.Column(db.Numeric(10, 4))

    # Walk-forward validation
    train_window_days = db.Column(db.Integer, default=30)
    test_window_days = db.Column(db.Integer, default=7)
    is_walk_forward = db.Column(db.Boolean, default=True)

    # Anti-overfitting
    overfitting_risk = db.Column(db.String(50))  # LOW, MEDIUM, HIGH
    improvement_vs_baseline = db.Column(db.Numeric(10, 4))  # %

    # Full trade log
    trades = db.Column(db.JSON)  # [{entry, exit, pnl, date}, ...]

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<BacktestResult {self.symbol} {self.start_date}>'

class CircuitBreakerEvent(db.Model):
    """Circuit breaker activation log"""
    __tablename__ = 'circuit_breaker_events'

    id = db.Column(db.Integer, primary_key=True)
    event_type = db.Column(db.String(50), nullable=False)  # 'consecutive_losses', 'max_drawdown', etc
    severity = db.Column(db.String(20))  # 'warning', 'pause', 'halt'
    reason = db.Column(db.Text)
    pause_until = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<CircuitBreakerEvent {self.event_type}>'

def init_db(app):
    """Initialize database"""
    with app.app_context():
        db.create_all()
        print("✓ Database initialized")
