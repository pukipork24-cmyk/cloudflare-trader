"""Master orchestrator - coordinates all agents"""
from datetime import datetime
from agents import *
from models.database import db, TradeDecision
from services.circuit_breaker import circuit_breaker
from config.settings import Config
import asyncio
import logging

logger = logging.getLogger(__name__)

class TradingOrchestrator:
    """Orchestrates 5-minute trading cycle"""

    def __init__(self):
        self.technical = TechnicalAgent()
        self.sentiment = SentimentAgent()
        self.fundamental = FundamentalAgent()
        self.risk = RiskAgent()
        self.portfolio = PortfolioAgent()
        self.intelligence = IntelligenceAgent()
        self.cio = CIOAgent()

    async def run_cycle(self, market_data):
        """Execute one complete 5-minute trading cycle"""
        logger.info(f"🚀 Starting trading cycle for {market_data.get('symbol')}")

        # Check circuit breaker
        if circuit_breaker.is_paused():
            logger.warning("⚠️ Circuit breaker active - skipping cycle")
            return None

        try:
            # Step 1: Run all agents in parallel
            logger.info("Step 1: Running agents...")

            results = await asyncio.gather(
                self.technical.analyze(market_data),
                self.sentiment.analyze(market_data),
                self.fundamental.analyze(market_data),
                self.risk.analyze(market_data),
                self.portfolio.analyze(market_data)
            )

            technical_result = results[0]
            sentiment_result = results[1]
            fundamental_result = results[2]
            risk_result = results[3]
            portfolio_result = results[4]

            logger.info(f"✓ Agents completed: Tech={technical_result.get('recommendation')}, "
                       f"Sentiment={sentiment_result.get('recommendation')}")

            # Step 2: Aggregate results
            logger.info("Step 2: Aggregating results...")

            aggregation = {
                'symbol': market_data.get('symbol'),
                'timestamp': datetime.utcnow().isoformat(),
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
                'timeframe': market_data.get('timeframe', '24-48h')
            }

            # Calculate consensus recommendation
            recommendations = [
                technical_result.get('recommendation'),
                sentiment_result.get('recommendation'),
                fundamental_result.get('recommendation'),
                risk_result.get('recommendation'),
                portfolio_result.get('recommendation')
            ]

            buy_votes = recommendations.count('BUY')
            sell_votes = recommendations.count('SELL')

            if buy_votes > sell_votes:
                aggregation['recommendation'] = 'BUY'
                aggregation['confidence'] = (buy_votes / 5) * 100
            elif sell_votes > buy_votes:
                aggregation['recommendation'] = 'SELL'
                aggregation['confidence'] = (sell_votes / 5) * 100
            else:
                aggregation['recommendation'] = 'HOLD'
                aggregation['confidence'] = 50

            aggregation['risk_level'] = risk_result.get('risk_level', 'MEDIUM')

            logger.info(f"✓ Aggregated: {aggregation['recommendation']} @ {aggregation['confidence']}%")

            # Step 3: Get intelligence analysis
            logger.info("Step 3: Intelligence analysis...")

            intelligence_result = await self.intelligence.analyze(aggregation)
            aggregation['intelligence_brief'] = intelligence_result

            logger.info(f"✓ Intelligence: {intelligence_result.get('narrative', 'N/A')[:50]}...")

            # Step 4: CIO approval
            logger.info("Step 4: CIO approval gate...")

            cio_result = await self.cio.analyze(aggregation)
            aggregation['cio_decision'] = cio_result.get('decision', 'SKIP')
            aggregation['cio_reasoning'] = cio_result.get('reasoning')

            if aggregation['cio_decision'] == 'EXECUTE':
                logger.info(f"✓ CIO APPROVED: {aggregation['cio_reasoning']}")
            else:
                logger.warning(f"⚠️ CIO REJECTED: {aggregation['cio_reasoning']}")

            # Step 5: Store decision
            logger.info("Step 5: Storing decision...")

            decision = TradeDecision(
                symbol=aggregation['symbol'],
                recommendation=aggregation['recommendation'],
                confidence=int(aggregation['confidence']),
                risk_level=aggregation['risk_level'],
                technical_rec=technical_result.get('recommendation'),
                technical_conf=technical_result.get('confidence'),
                sentiment_rec=sentiment_result.get('recommendation'),
                sentiment_conf=sentiment_result.get('confidence'),
                fundamental_rec=fundamental_result.get('recommendation'),
                fundamental_conf=fundamental_result.get('confidence'),
                risk_rec=risk_result.get('recommendation'),
                risk_conf=risk_result.get('confidence'),
                portfolio_rec=portfolio_result.get('recommendation'),
                portfolio_conf=portfolio_result.get('confidence'),
                intelligence_narrative=intelligence_result.get('narrative'),
                consensus_quality=intelligence_result.get('consensus_quality'),
                red_flags=intelligence_result.get('red_flags'),
                conflicts=intelligence_result.get('conflicts'),
                cio_decision=aggregation['cio_decision'],
                cio_reasoning=aggregation['cio_reasoning'],
                entry_zone=aggregation['entry_zone'],
                stop_loss=aggregation['stop_loss'],
                target=aggregation['target'],
                timeframe=aggregation['timeframe']
            )

            db.session.add(decision)
            db.session.commit()

            logger.info(f"✓ Decision stored (ID: {decision.id})")

            return aggregation

        except Exception as e:
            logger.error(f"❌ Cycle error: {e}", exc_info=True)
            return None

orchestrator = TradingOrchestrator()
