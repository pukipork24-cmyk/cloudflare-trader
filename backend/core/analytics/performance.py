"""Performance analytics and trade journal"""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import logging
import json

logger = logging.getLogger(__name__)

@dataclass
class TradeJournalEntry:
    """Single trade journal entry"""
    trade_id: str
    symbol: str
    side: str
    quantity: float
    entry_price: float
    exit_price: float
    entry_time: datetime
    exit_time: datetime
    pnl: float
    pnl_percentage: float
    fees: float
    strategy: str
    confidence_score: float
    signal_source: str
    hold_duration_hours: float
    market_regime: str
    risk_level: str
    notes: str = ""

@dataclass
class DailyPerformanceReport:
    """Daily performance summary"""
    date: datetime
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_pnl: float
    total_fees: float
    net_pnl: float
    best_trade: float
    worst_trade: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    sharpe_ratio: float
    max_drawdown: float
    exposure_hours: float

class PerformanceAnalytics:
    """Comprehensive performance analytics and trade journal"""
    
    def __init__(self, db_session=None):
        self.db_session = db_session
        self.trade_journal: List[TradeJournalEntry] = []
        self.daily_reports: List[DailyPerformanceReport] = []
        self.benchmark_data: Dict[str, pd.DataFrame] = {}
        
        # Load historical data
        self._load_trade_journal()
        self._load_benchmark_data()
    
    def log_trade(self, trade_data: Dict) -> bool:
        """Log a completed trade to the journal"""
        try:
            # Calculate hold duration
            entry_time = trade_data.get('entry_time', datetime.now())
            exit_time = trade_data.get('exit_time', datetime.now())
            hold_duration = (exit_time - entry_time).total_seconds() / 3600.0
            
            # Create journal entry
            entry = TradeJournalEntry(
                trade_id=trade_data.get('trade_id', ''),
                symbol=trade_data.get('symbol', ''),
                side=trade_data.get('side', ''),
                quantity=trade_data.get('quantity', 0.0),
                entry_price=trade_data.get('entry_price', 0.0),
                exit_price=trade_data.get('exit_price', 0.0),
                entry_time=entry_time,
                exit_time=exit_time,
                pnl=trade_data.get('pnl', 0.0),
                pnl_percentage=trade_data.get('pnl_percentage', 0.0),
                fees=trade_data.get('fees', 0.0),
                strategy=trade_data.get('strategy', 'Unknown'),
                confidence_score=trade_data.get('confidence_score', 0.0),
                signal_source=trade_data.get('signal_source', 'Unknown'),
                hold_duration_hours=hold_duration,
                market_regime=trade_data.get('market_regime', 'Unknown'),
                risk_level=trade_data.get('risk_level', 'Unknown'),
                notes=trade_data.get('notes', '')
            )
            
            # Add to journal
            self.trade_journal.append(entry)
            
            # Save to database if available
            if self.db_session:
                self._save_to_database(entry)
            
            # Update daily report
            self._update_daily_report(entry)
            
            logger.info(f"Trade logged: {entry.symbol} {entry.side} PnL: {entry.pnl:.2f}")
            return True
            
        except Exception as e:
            logger.error(f"Error logging trade: {e}")
            return False
    
    def _save_to_database(self, entry: TradeJournalEntry):
        """Save trade entry to database"""
        try:
            # This would save to your database schema
            # Implementation depends on your specific DB setup
            pass
        except Exception as e:
            logger.error(f"Error saving trade to database: {e}")
    
    def _load_trade_journal(self):
        """Load existing trade journal from storage"""
        try:
            # Load from file or database
            journal_file = 'trade_journal.json'
            
            if os.path.exists(journal_file):
                with open(journal_file, 'r') as f:
                    data = json.load(f)
                    
                for entry_data in data:
                    # Convert datetime strings back to datetime objects
                    entry_data['entry_time'] = datetime.fromisoformat(entry_data['entry_time'])
                    entry_data['exit_time'] = datetime.fromisoformat(entry_data['exit_time'])
                    
                    entry = TradeJournalEntry(**entry_data)
                    self.trade_journal.append(entry)
                
                logger.info(f"Loaded {len(self.trade_journal)} trades from journal")
                
        except Exception as e:
            logger.error(f"Error loading trade journal: {e}")
    
    def _save_trade_journal(self):
        """Save trade journal to storage"""
        try:
            journal_file = 'trade_journal.json'
            
            # Convert to serializable format
            data = []
            for entry in self.trade_journal:
                entry_dict = asdict(entry)
                entry_dict['entry_time'] = entry.entry_time.isoformat()
                entry_dict['exit_time'] = entry.exit_time.isoformat()
                data.append(entry_dict)
            
            with open(journal_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            
            logger.info(f"Saved {len(self.trade_journal)} trades to journal")
            
        except Exception as e:
            logger.error(f"Error saving trade journal: {e}")
    
    def generate_daily_report(self, date: datetime = None) -> DailyPerformanceReport:
        """Generate daily performance report"""
        if date is None:
            date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Filter trades for this date
        day_trades = [
            trade for trade in self.trade_journal
            if trade.entry_time.date() == date.date()
        ]
        
        if not day_trades:
            return DailyPerformanceReport(
                date=date,
                total_trades=0, winning_trades=0, losing_trades=0, win_rate=0.0,
                total_pnl=0.0, total_fees=0.0, net_pnl=0.0,
                best_trade=0.0, worst_trade=0.0, avg_win=0.0, avg_loss=0.0,
                profit_factor=0.0, sharpe_ratio=0.0, max_drawdown=0.0,
                exposure_hours=0.0
            )
        
        # Calculate metrics
        winning_trades = [t for t in day_trades if t.pnl > 0]
        losing_trades = [t for t in day_trades if t.pnl < 0]
        
        total_pnl = sum(t.pnl for t in day_trades)
        total_fees = sum(t.fees for t in day_trades)
        net_pnl = total_pnl - total_fees
        
        win_rate = len(winning_trades) / len(day_trades) * 100 if day_trades else 0.0
        
        avg_win = np.mean([t.pnl for t in winning_trades]) if winning_trades else 0.0
        avg_loss = np.mean([t.pnl for t in losing_trades]) if losing_trades else 0.0
        
        best_trade = max([t.pnl for t in day_trades]) if day_trades else 0.0
        worst_trade = min([t.pnl for t in day_trades]) if day_trades else 0.0
        
        # Profit factor
        total_wins = sum(t.pnl for t in winning_trades)
        total_losses = abs(sum(t.pnl for t in losing_trades))
        profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
        
        # Sharpe ratio (simplified)
        returns = [t.pnl_percentage for t in day_trades]
        sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252) if len(returns) > 1 and np.std(returns) > 0 else 0.0
        
        # Max drawdown (simplified)
        cumulative_pnl = np.cumsum([t.pnl for t in day_trades])
        running_max = np.maximum.accumulate(cumulative_pnl)
        drawdown = (cumulative_pnl - running_max)
        max_drawdown = np.min(drawdown) if len(drawdown) > 0 else 0.0
        
        # Exposure hours
        exposure_hours = sum(t.hold_duration_hours for t in day_trades)
        
        report = DailyPerformanceReport(
            date=date,
            total_trades=len(day_trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            win_rate=win_rate,
            total_pnl=total_pnl,
            total_fees=total_fees,
            net_pnl=net_pnl,
            best_trade=best_trade,
            worst_trade=worst_trade,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_drawdown,
            exposure_hours=exposure_hours
        )
        
        # Store report
        existing_report = next((r for r in self.daily_reports if r.date == date), None)
        if existing_report:
            self.daily_reports[self.daily_reports.index(existing_report)] = report
        else:
            self.daily_reports.append(report)
        
        return report
    
    def _update_daily_report(self, trade: TradeJournalEntry):
        """Update daily report with new trade"""
        trade_date = trade.entry_time.date()
        report_date = datetime.combine(trade_date, datetime.min.time())
        
        # Find existing report or create new one
        existing_report = next((r for r in self.daily_reports if r.date == report_date), None)
        if existing_report:
            # Update existing report
            self.generate_daily_report(report_date)
        else:
            # Create new report
            self.generate_daily_report(report_date)
    
    def analyze_signal_attribution(self) -> Dict[str, Dict]:
        """Analyze which signals/models drove each trade"""
        attribution = {}
        
        for signal_source in set(t.signal_source for t in self.trade_journal):
            source_trades = [t for t in self.trade_journal if t.signal_source == signal_source]
            
            if not source_trades:
                continue
            
            # Calculate metrics for this signal source
            winning_trades = [t for t in source_trades if t.pnl > 0]
            win_rate = len(winning_trades) / len(source_trades) * 100
            
            total_pnl = sum(t.pnl for t in source_trades)
            avg_pnl = total_pnl / len(source_trades)
            
            attribution[signal_source] = {
                'trade_count': len(source_trades),
                'win_rate': win_rate,
                'total_pnl': total_pnl,
                'avg_pnl': avg_pnl,
                'best_trade': max([t.pnl for t in source_trades]),
                'worst_trade': min([t.pnl for t in source_trades]),
                'symbols_traded': list(set(t.symbol for t in source_trades))
            }
        
        return attribution
    
    def calculate_rolling_metrics(self, window_days: int = 30) -> Dict:
        """Calculate rolling performance metrics"""
        if len(self.trade_journal) < 2:
            return {}
        
        # Create daily returns series
        daily_returns = []
        dates = []
        
        # Group trades by date
        trades_by_date = {}
        for trade in self.trade_journal:
            date = trade.entry_time.date()
            if date not in trades_by_date:
                trades_by_date[date] = []
            trades_by_date[date].append(trade)
        
        # Calculate daily PnL
        for date, trades in sorted(trades_by_date.items()):
            daily_pnl = sum(t.pnl for t in trades)
            daily_returns.append(daily_pnl)
            dates.append(date)
        
        if len(daily_returns) < window_days:
            return {}
        
        # Calculate rolling metrics
        rolling_returns = daily_returns[-window_days:]
        rolling_dates = dates[-window_days:]
        
        # Sharpe ratio
        if len(rolling_returns) > 1 and np.std(rolling_returns) > 0:
            sharpe_ratio = np.mean(rolling_returns) / np.std(rolling_returns) * np.sqrt(252)
        else:
            sharpe_ratio = 0.0
        
        # Rolling win rate
        win_days = len([r for r in rolling_returns if r > 0])
        win_rate = win_days / len(rolling_returns) * 100
        
        # Rolling max drawdown
        cumulative_returns = np.cumsum(rolling_returns)
        running_max = np.maximum.accumulate(cumulative_returns)
        drawdown = (cumulative_returns - running_max)
        max_drawdown = np.min(drawdown) if len(drawdown) > 0 else 0.0
        
        return {
            'window_days': window_days,
            'start_date': rolling_dates[0].isoformat() if rolling_dates else None,
            'end_date': rolling_dates[-1].isoformat() if rolling_dates else None,
            'total_return': sum(rolling_returns),
            'sharpe_ratio': sharpe_ratio,
            'win_rate': win_rate,
            'max_drawdown': max_drawdown,
            'volatility': np.std(rolling_returns),
            'best_day': max(rolling_returns) if rolling_returns else 0.0,
            'worst_day': min(rolling_returns) if rolling_returns else 0.0
        }
    
    def benchmark_comparison(self, benchmark_symbol: str = 'BTC') -> Dict:
        """Compare strategy performance against buy-and-hold benchmark"""
        if benchmark_symbol not in self.benchmark_data:
            return {'error': f'Benchmark data not available for {benchmark_symbol}'}
        
        benchmark_df = self.benchmark_data[benchmark_symbol]
        if benchmark_df.empty:
            return {'error': f'No benchmark data for {benchmark_symbol}'}
        
        # Get strategy returns
        strategy_trades = [t for t in self.trade_journal if t.symbol == benchmark_symbol]
        if not strategy_trades:
            return {'error': f'No strategy trades for {benchmark_symbol}'}
        
        # Calculate strategy cumulative returns
        strategy_returns = []
        for trade in strategy_trades:
            strategy_returns.append(trade.pnl_percentage / 100)
        
        # Calculate benchmark returns over same period
        start_date = min(t.entry_time for t in strategy_trades)
        end_date = max(t.exit_time for t in strategy_trades)
        
        benchmark_period = benchmark_df[
            (benchmark_df.index >= start_date) & 
            (benchmark_df.index <= end_date)
        ]
        
        if benchmark_period.empty:
            return {'error': 'No overlapping data for benchmark comparison'}
        
        benchmark_returns = benchmark_period['close'].pct_change().dropna()
        
        # Calculate metrics
        strategy_total_return = (1 + np.array(strategy_returns)).prod() - 1
        benchmark_total_return = (1 + benchmark_returns).prod() - 1
        
        strategy_sharpe = np.mean(strategy_returns) / np.std(strategy_returns) * np.sqrt(252) if len(strategy_returns) > 1 and np.std(strategy_returns) > 0 else 0.0
        benchmark_sharpe = benchmark_returns.mean() / benchmark_returns.std() * np.sqrt(252) if len(benchmark_returns) > 1 and benchmark_returns.std() > 0 else 0.0
        
        return {
            'symbol': benchmark_symbol,
            'period': f"{start_date.date()} to {end_date.date()}",
            'strategy_total_return': strategy_total_return * 100,
            'benchmark_total_return': benchmark_total_return * 100,
            'strategy_sharpe': strategy_sharpe,
            'benchmark_sharpe': benchmark_sharpe,
            'alpha': strategy_total_return - benchmark_total_return,
            'excess_return': (strategy_total_return - benchmark_total_return) * 100,
            'strategy_trades': len(strategy_trades),
            'benchmark_volatility': benchmark_returns.std() * np.sqrt(252),
            'strategy_volatility': np.std(strategy_returns) * np.sqrt(252) if len(strategy_returns) > 1 else 0.0
        }
    
    def _load_benchmark_data(self):
        """Load benchmark data (free sources like Yahoo Finance)"""
        try:
            import yfinance as yf
            
            # Download major crypto data
            tickers = ['BTC-USD', 'ETH-USD', 'BNB-USD']
            
            for ticker in tickers:
                try:
                    data = yf.download(ticker, period="2y", interval="1d")
                    if not data.empty:
                        self.benchmark_data[ticker.replace('-USD', '')] = data
                        logger.info(f"Loaded benchmark data for {ticker}")
                except Exception as e:
                    logger.error(f"Error loading benchmark data for {ticker}: {e}")
                    
        except ImportError:
            logger.warning("yfinance not installed - pip install yfinance for benchmark comparison")
        except Exception as e:
            logger.error(f"Error loading benchmark data: {e}")
    
    def export_trade_journal(self, filename: str = None, format_type: str = 'csv') -> bool:
        """Export trade journal to file"""
        try:
            if filename is None:
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"trade_journal_{timestamp}.{format_type}"
            
            if format_type.lower() == 'csv':
                df = pd.DataFrame([asdict(entry) for entry in self.trade_journal])
                df.to_csv(filename, index=False)
            elif format_type.lower() == 'json':
                self._save_trade_journal()
                import shutil
                shutil.copy('trade_journal.json', filename)
            else:
                raise ValueError(f"Unsupported format: {format_type}")
            
            logger.info(f"Trade journal exported to {filename}")
            return True
            
        except Exception as e:
            logger.error(f"Error exporting trade journal: {e}")
            return False
    
    def get_performance_summary(self, days: int = 30) -> Dict:
        """Get comprehensive performance summary"""
        if not self.trade_journal:
            return {'error': 'No trade data available'}
        
        # Filter recent trades
        cutoff_date = datetime.now() - timedelta(days=days)
        recent_trades = [t for t in self.trade_journal if t.entry_time >= cutoff_date]
        
        if not recent_trades:
            return {'error': f'No trades in last {days} days'}
        
        # Basic metrics
        total_trades = len(recent_trades)
        winning_trades = len([t for t in recent_trades if t.pnl > 0])
        win_rate = winning_trades / total_trades * 100
        
        total_pnl = sum(t.pnl for t in recent_trades)
        total_fees = sum(t.fees for t in recent_trades)
        net_pnl = total_pnl - total_fees
        
        # Advanced metrics
        returns = [t.pnl_percentage for t in recent_trades]
        sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252) if len(returns) > 1 and np.std(returns) > 0 else 0.0
        
        # Signal attribution
        attribution = self.analyze_signal_attribution()
        
        # Rolling metrics
        rolling_metrics = self.calculate_rolling_metrics(min(days, 30))
        
        return {
            'period_days': days,
            'total_trades': total_trades,
            'winning_trades': winning_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'total_fees': total_fees,
            'net_pnl': net_pnl,
            'avg_trade_pnl': total_pnl / total_trades,
            'sharpe_ratio': sharpe_ratio,
            'signal_attribution': attribution,
            'rolling_metrics': rolling_metrics,
            'symbols_traded': list(set(t.symbol for t in recent_trades)),
            'strategies_used': list(set(t.strategy for t in recent_trades))
        }

# Global performance analytics instance
performance_analytics = PerformanceAnalytics()
