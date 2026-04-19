"""Flask API endpoints"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from models.database import db, Trade, TradeDecision, BacktestResult
from services.bitget_client import bitget_client
from services.circuit_breaker import circuit_breaker
from backtest.engine import backtest_engine
from agents import *
from .auth import require_auth
from .errors import *
import asyncio
import logging

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

_BITGET_HTTP = 'https://api.bitget.com'


def _bitget_spot_granularity(interval: str) -> str:
    """Map UI/Binance-style intervals to Bitget v2 spot `granularity` (see Bitget API docs)."""
    key = (interval or '15m').strip().lower()
    return {
        '1m': '1min',
        '3m': '3min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1h',
        '2h': '2H',
        '4h': '4h',
        '6h': '6h',
        '12h': '12h',
        '1d': '1day',
        '3d': '3day',
        '1w': '1week',
        '1mo': '1M',
    }.get(key, interval)

# ===== HEALTH CHECK =====

@api_bp.route('/', methods=['GET'])
def health_check():
    """API health check"""
    return {
        'status': 'online',
        'service': 'AI Trading Bot Backend',
        'version': '2.0',
        'endpoints': [
            '/api/analyze - POST market analysis',
            '/api/evolution/status - GET evolution status',
            '/api/evolution/optimize - POST trigger evolution',
            '/api/trades - GET trade history',
            '/api/intelligence-logs - GET market intelligence logs'
        ]
    }, 200

# ===== LIVE TRADING =====

@api_bp.route('/analyze', methods=['POST'])
@require_auth
async def analyze():
    """Multi-agent market analysis"""
    try:
        data = request.json
        symbol = data.get('symbol', 'BTC')

        # Check circuit breaker
        if circuit_breaker.is_paused():
            return {'error': 'Circuit breaker activated - trading paused'}, 503

        # Run all agents
        technical = TechnicalAgent()
        sentiment = SentimentAgent()
        fundamental = FundamentalAgent()
        risk = RiskAgent()
        portfolio = PortfolioAgent()
        intelligence = IntelligenceAgent()

        # Gather data
        market_data = {
            'symbol': symbol,
            'price': data.get('price'),
            'rsi': data.get('rsi'),
            'macd': data.get('macd'),
            'bb_pos': data.get('bb_pos'),
            'high': data.get('high'),
            'low': data.get('low'),
            'volume': data.get('volume'),
            'fear_greed': data.get('fear_greed'),
            'balance': data.get('balance', 10000),
            'open_positions': data.get('open_positions', 0),
            'daily_loss': data.get('daily_loss', 0)
        }

        # Run agents in parallel
        loop = asyncio.get_event_loop()
        technical_result = await technical.analyze(market_data)
        sentiment_result = await sentiment.analyze(market_data)
        fundamental_result = await fundamental.analyze(market_data)
        risk_result = await risk.analyze(market_data)
        portfolio_result = await portfolio.analyze(market_data)

        # Aggregate
        aggregation = {
            'symbol': symbol,
            'recommendation': 'BUY',  # Majority vote
            'confidence': 70,
            'risk_level': 'MEDIUM',
            'technical_rec': technical_result.get('recommendation'),
            'technical_conf': technical_result.get('confidence'),
            'sentiment_rec': sentiment_result.get('recommendation'),
            'sentiment_conf': sentiment_result.get('confidence'),
            'fundamental_rec': fundamental_result.get('recommendation'),
            'fundamental_conf': fundamental_result.get('confidence'),
            'risk_rec': risk_result.get('recommendation'),
            'risk_conf': risk_result.get('confidence'),
            'portfolio_rec': portfolio_result.get('recommendation'),
            'portfolio_conf': portfolio_result.get('confidence'),
            'entry_zone': technical_result.get('entry_zone'),
            'stop_loss': risk_result.get('stop_loss'),
            'target': technical_result.get('target'),
            'timeframe': '24-48h'
        }

        # Get intelligence analysis
        intelligence_result = await intelligence.analyze(aggregation)
        aggregation['intelligence_brief'] = intelligence_result

        # Store decision
        decision = TradeDecision(**aggregation, cio_decision='PENDING')
        db.session.add(decision)
        db.session.commit()

        return {
            'success': True,
            'decision_id': decision.id,
            'aggregation': aggregation,
            'intelligence': intelligence_result
        }, 200

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/execute', methods=['POST'])
@require_auth
def execute_trade():
    """Execute trade based on CIO approval"""
    try:
        data = request.json
        decision_id = data.get('decision_id')
        cio_decision = data.get('cio_decision', 'SKIP')  # EXECUTE, SKIP, MODIFY

        # Check circuit breaker
        if circuit_breaker.is_paused():
            return {'error': 'Circuit breaker triggered'}, 503

        decision = TradeDecision.query.get(decision_id)
        if not decision:
            return {'error': 'Decision not found'}, 404

        # Update CIO decision
        decision.cio_decision = cio_decision

        if cio_decision != 'EXECUTE':
            db.session.commit()
            return {'success': True, 'message': f'Trade {cio_decision}'}

        # Execute trade
        from config.settings import Config
        if not Config.TRADING_ENABLED:
            return {'error': 'Trading disabled'}, 403

        # Place order
        symbol = decision.symbol + 'USDT'
        side = 'buy' if decision.recommendation == 'BUY' else 'sell'
        position_size = float(decision.risk_rec) * 100 if decision.risk_rec else 1000

        order_result = bitget_client.place_order(
            symbol=symbol,
            side=side,
            order_type='market',
            size=position_size / float(decision.entry_zone or 40000)
        )

        if order_result['success']:
            # Log trade
            trade = Trade(
                trade_decision_id=decision_id,
                bitget_order_id=order_result['order_id'],
                coin=decision.symbol,
                direction=side.upper(),
                quantity=position_size,
                planned_entry_price=float(decision.entry_zone or 40000),
                stop_loss=float(decision.stop_loss or 39000),
                take_profit_1=float(decision.target or 41000),
                status='OPEN',
                agent_confidence=decision.confidence,
                risk_level=decision.risk_level,
                cio_decision=cio_decision
            )

            db.session.add(trade)
            db.session.commit()

            return {
                'success': True,
                'trade_id': trade.id,
                'order_id': order_result['order_id'],
                'message': f'Trade executed: {side.upper()} {symbol}'
            }, 200
        else:
            return {'error': order_result.get('error')}, 400

    except Exception as e:
        logger.error(f"Execution error: {e}")
        return {'error': str(e)}, 500

# ===== BACKTESTING =====

@api_bp.route('/backtest', methods=['POST'])
@require_auth
async def run_backtest():
    """Run backtest with walk-forward validation"""
    try:
        data = request.json
        symbol = data.get('symbol', 'BTC')
        start_date = datetime.fromisoformat(data.get('start_date'))
        end_date = datetime.fromisoformat(data.get('end_date'))

        # Validate dates
        if (end_date - start_date).days < 60:
            return {'error': 'Minimum 60 days required'}, 400

        # Initialize agents
        technical = TechnicalAgent()
        sentiment = SentimentAgent()
        fundamental = FundamentalAgent()
        risk = RiskAgent()
        portfolio = PortfolioAgent()

        agents = [technical, sentiment, fundamental, risk, portfolio]

        # Run backtest
        result = await backtest_engine.run_backtest(symbol, start_date, end_date, agents)

        if result.get('error'):
            return {'error': result['error']}, 400

        return {
            'success': True,
            'backtest_id': result.get('result_id'),
            'metrics': result.get('metrics'),
            'overfitting': result.get('overfitting'),
            'windows': result.get('walk_forward_windows')
        }, 200

    except Exception as e:
        logger.error(f"Backtest error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/backtest/<int:backtest_id>', methods=['GET'])
@require_auth
def get_backtest(backtest_id):
    """Fetch backtest results"""
    result = BacktestResult.query.get(backtest_id)
    if not result:
        return {'error': 'Backtest not found'}, 404

    return {
        'id': result.id,
        'symbol': result.symbol,
        'metrics': {
            'total_trades': result.total_trades,
            'win_rate': float(result.win_rate) if result.win_rate else 0,
            'total_pnl': float(result.total_pnl_usdt) if result.total_pnl_usdt else 0,
            'sharpe_ratio': float(result.sharpe_ratio) if result.sharpe_ratio else 0,
            'max_drawdown': float(result.max_drawdown_pct) if result.max_drawdown_pct else 0
        },
        'overfitting_risk': result.overfitting_risk,
        'trades': result.trades  # JSON
    }, 200

# ===== DATA & MONITORING =====

@api_bp.route('/intelligence-logs', methods=['GET'])
def intelligence_logs():
    """Get market intelligence reports"""
    limit = request.args.get('limit', 50, type=int)
    decisions = TradeDecision.query.order_by(TradeDecision.created_at.desc()).limit(limit).all()

    return {
        'logs': [
            {
                'timestamp': d.created_at.isoformat(),
                'symbol': d.symbol,
                'headline': f"{d.recommendation} @ {d.confidence}%",
                'recommendation': d.recommendation,
                'confidence': d.confidence,
                'risk_level': d.risk_level,
                'data': {
                    'technical': d.technical_rec,
                    'sentiment': d.sentiment_rec,
                    'fundamental': d.fundamental_rec
                }
            }
            for d in decisions
        ]
    }, 200

@api_bp.route('/trades', methods=['GET'])
def get_trades():
    """Get trade history"""
    limit = request.args.get('limit', 100, type=int)
    status = request.args.get('status')

    query = Trade.query
    if status:
        query = query.filter_by(status=status)

    trades = query.order_by(Trade.created_at.desc()).limit(limit).all()

    return {
        'trades': [
            {
                'id': t.id,
                'symbol': t.coin,
                'direction': t.direction,
                'status': t.status,
                'entry_price': float(t.actual_entry_price or t.planned_entry_price),
                'quantity': float(t.quantity),
                'pnl': float(t.net_pnl_usdt) if t.net_pnl_usdt else None,
                'opened_at': t.opened_at.isoformat(),
                'closed_at': t.closed_at.isoformat() if t.closed_at else None,
                'cio_decision': t.cio_decision
            }
            for t in trades
        ]
    }, 200

@api_bp.route('/balance', methods=['GET'])
def get_balance():
    """Get current balance"""
    result = bitget_client.get_balance()

    if result['success']:
        return {
            'success': True,
            'balances': result['balances'],
            'total_usd': sum(float(b['total']) * (40000 if 'BTC' in coin else 2000 if 'ETH' in coin else 1)
                           for coin, b in result['balances'].items())
        }, 200

    return {'error': result.get('error')}, 500

# ===== EVOLUTION & OPTIMIZATION =====

@api_bp.route('/evolution/status', methods=['GET'])
def get_evolution_status():
    """Get evolution scheduler status"""
    from evolution.scheduler import evolution_scheduler

    return {
        'success': True,
        'status': evolution_scheduler.get_status()
    }, 200

@api_bp.route('/evolution/optimize', methods=['POST'])
def trigger_evolution():
    """Manually trigger evolution cycle (admin only)"""
    from evolution.scheduler import evolution_scheduler
    from evolution.optimizer import optimizer
    import asyncio

    try:
        data = {}
        try:
            data = request.get_json(silent=True) or {}
        except Exception:
            data = {}

        # Reset params to defaults (fast path)
        if data.get('reset') is True:
            if not optimizer:
                return {'error': 'Optimizer not initialized'}, 500
            optimizer.reset_to_defaults()
            return {
                'success': True,
                'message': 'Parameters reset to defaults',
                'status': evolution_scheduler.get_status()
            }, 200

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        asyncio.run(evolution_scheduler.run_evolution_cycle())
        loop.close()

        return {
            'success': True,
            'message': 'Evolution cycle triggered',
            'status': evolution_scheduler.get_status()
        }, 200
    except Exception as e:
        logger.error(f"Evolution trigger failed: {e}")
        return {'error': str(e)}, 500

# ===== PRICE CHART =====

@api_bp.route('/price-chart', methods=['GET'])
def get_price_chart():
    """Get OHLC chart data for a symbol (range: 24h, week, month, year)."""
    try:
        symbol = request.args.get('symbol', 'BTCUSDT')
        range_key = (request.args.get('range') or '24h').lower().strip()
        # Bitget v2 spot market candles: granularity + limit (approximate span)
        presets = {
            '24h': ('1h', 24),
            'week': ('4h', 42),
            'month': ('1day', 31),
            'year': ('1day', 365),
        }
        if range_key not in presets:
            range_key = '24h'
        gran, lim = presets[range_key]

        import requests
        url = (
            f'{_BITGET_HTTP}/api/v2/spot/market/candles'
            f'?symbol={symbol}&granularity={gran}&limit={lim}'
        )
        resp = requests.get(url, timeout=10)
        data = resp.json()

        if data.get('code') == '00000' and data.get('data'):
            candles = sorted(data['data'], key=lambda c: int(c[0]))
            return {
                'success': True,
                'symbol': symbol,
                'range': range_key,
                'granularity': gran,
                'data': [
                    {
                        'time': int(c[0]),
                        'open': float(c[1]),
                        'close': float(c[4])
                    }
                    for c in candles
                ]
            }, 200
        else:
            return {'error': 'Failed to fetch price data'}, 400

    except Exception as e:
        logger.error(f"Price chart error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/ticker', methods=['GET'])
def get_ticker():
    """Get current price ticker for a symbol"""
    try:
        symbol = request.args.get('symbol', 'BTCUSDT')

        import requests
        url = f'{_BITGET_HTTP}/api/v2/spot/market/tickers?symbol={symbol}'
        resp = requests.get(url, timeout=5)
        data = resp.json()

        if data.get('code') == '00000' and data.get('data'):
            ticker = data['data'][0] if data['data'] else {}
            return {
                'success': True,
                'symbol': symbol,
                'price': float(ticker.get('lastPr', 0)),
                'change24h': float(ticker.get('change24h', 0)),
                'high24h': float(ticker.get('high24h', 0)),
                'low24h': float(ticker.get('low24h', 0)),
                'volume24h': ticker.get('baseVolume', 0)
            }, 200
        else:
            return {'error': 'Failed to fetch ticker'}, 400

    except Exception as e:
        logger.error(f"Ticker error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/candles', methods=['GET'])
def get_candles():
    """Get candlestick data for a symbol"""
    try:
        symbol = request.args.get('symbol', 'BTCUSDT')
        interval = request.args.get('interval', '15m')
        limit = request.args.get('limit', '60')

        import requests
        gran = _bitget_spot_granularity(interval)
        url = (
            f'{_BITGET_HTTP}/api/v2/spot/market/candles'
            f'?symbol={symbol}&granularity={gran}&limit={limit}'
        )
        resp = requests.get(url, timeout=5)
        data = resp.json()

        if data.get('code') == '00000' and data.get('data'):
            candles = data['data']
            return {
                'success': True,
                'symbol': symbol,
                'interval': interval,
                'data': [
                    {
                        'time': int(c[0]),
                        'open': float(c[1]),
                        'high': float(c[2]),
                        'low': float(c[3]),
                        'close': float(c[4]),
                        'volume': float(c[5])
                    }
                    for c in candles
                ]
            }, 200
        else:
            return {'error': 'Failed to fetch candles'}, 400

    except Exception as e:
        logger.error(f"Candles error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/prediction', methods=['GET'])
def get_prediction():
    """Get AI prediction for current market"""
    try:
        symbol = request.args.get('symbol', 'BTC')

        # Return mock prediction (can be enhanced with real ML later)
        return {
            'success': True,
            'symbol': symbol,
            'prediction': 'ANALYZING',
            'confidence': 0,
            'recommendation': 'HOLD',
            'timestamp': datetime.utcnow().isoformat()
        }, 200

    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return {'error': str(e)}, 500

@api_bp.route('/bitget-balance', methods=['GET'])
def get_bitget_balance():
    """Get Bitget account balance"""
    try:
        result = bitget_client.get_balance()

        if result.get('success'):
            balances = result.get('balances') or {}
            usdt_balance = float(balances.get('USDT', 0))

            return {
                'success': True,
                'totalUSD': str(usdt_balance),
                'totalMYR': str(usdt_balance * 4.5),  # Placeholder conversion
                'balances': balances,
                'timestamp': result.get('timestamp')
            }, 200
        else:
            return {
                'success': False,
                'error': result.get('error', 'Failed to fetch balance'),
                'totalUSD': '0.00',
                'totalMYR': '0.00'
            }, 400

    except Exception as e:
        logger.error(f"Balance fetch error: {e}")
        return {
            'success': False,
            'error': str(e),
            'totalUSD': '0.00',
            'totalMYR': '0.00'
        }, 500
