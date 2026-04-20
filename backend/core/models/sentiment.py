"""FinBERT sentiment scoring pipeline for financial news"""
import requests
import re
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
import pandas as pd
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class SentimentSource(Enum):
    NEWS_API = "newsapi"
    RSS_FEED = "rss"
    TELEGRAM = "telegram"
    TWITTER = "twitter"

class SentimentLabel(Enum):
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEUTRAL = "NEUTRAL"

@dataclass
class SentimentScore:
    symbol: str
    source: str
    text: str
    sentiment: SentimentLabel
    confidence: float
    score: float  # -1 to +1
    timestamp: datetime
    url: Optional[str] = None

class FinBERTSentimentAnalyzer:
    """FinBERT sentiment analysis for financial text"""
    
    def __init__(self):
        self.model_name = "ProsusAI/finbert"
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        try:
            # Load FinBERT model and tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()
            
            # Create pipeline
            self.sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if torch.cuda.is_available() else -1
            )
            
            logger.info(f"FinBERT model loaded on {self.device}")
            
        except Exception as e:
            logger.error(f"Failed to load FinBERT model: {e}")
            self.sentiment_pipeline = None
        
        # Cache for recent sentiment scores
        self.sentiment_cache: Dict[str, List[SentimentScore]] = {}
        self.cache_duration_hours = 24
        
        # Free news sources
        self.news_sources = [
            "https://news.google.com/rss/search?q=cryptocurrency&hl=en&gl=US&ceid=US:en",
            "https://cointelegraph.com/rss",
            "https://www.coindesk.com/arc/outboundfeeds/rss/",
            "https://decrypt.co/feed",
            "https://cryptonews.com/news/feed"
        ]
        
        # Keywords for crypto relevance
        self.crypto_keywords = [
            'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency',
            'blockchain', 'defi', 'nft', 'altcoin', 'solana', 'sol',
            'cardano', 'ada', 'polkadot', 'dot', 'avalanche', 'avax',
            'binance', 'coinbase', 'kraken', 'bitget', 'trading'
        ]
    
    def analyze_text(self, text: str, symbol: str = "GENERAL") -> Optional[SentimentScore]:
        """Analyze sentiment of a single text"""
        if not self.sentiment_pipeline:
            logger.warning("FinBERT pipeline not available")
            return None
        
        try:
            # Preprocess text
            cleaned_text = self._preprocess_text(text)
            
            if not cleaned_text or len(cleaned_text.strip()) < 10:
                return None
            
            # Get sentiment prediction
            result = self.sentiment_pipeline(cleaned_text)[0]
            
            # Convert to standardized format
            label_map = {
                'POSITIVE': SentimentLabel.POSITIVE,
                'NEGATIVE': SentimentLabel.NEGATIVE,
                'NEUTRAL': SentimentLabel.NEUTRAL
            }
            
            sentiment = label_map.get(result['label'].upper(), SentimentLabel.NEUTRAL)
            confidence = result['score']
            
            # Convert to -1 to +1 score
            if sentiment == SentimentLabel.POSITIVE:
                score = confidence
            elif sentiment == SentimentLabel.NEGATIVE:
                score = -confidence
            else:
                score = 0.0
            
            return SentimentScore(
                symbol=symbol,
                source="finbert",
                text=cleaned_text[:200],  # Truncate for storage
                sentiment=sentiment,
                confidence=confidence,
                score=score,
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error analyzing text: {e}")
            return None
    
    def fetch_news_sentiment(self, symbol: str = None, max_articles: int = 50) -> List[SentimentScore]:
        """Fetch and analyze news sentiment"""
        sentiment_scores = []
        
        # Fetch from RSS feeds
        for feed_url in self.news_sources:
            try:
                articles = self._fetch_rss_feed(feed_url, max_articles // len(self.news_sources))
                
                for article in articles:
                    # Check if crypto-relevant
                    if not self._is_crypto_relevant(article['title'] + ' ' + article['content']):
                        continue
                    
                    # Analyze sentiment
                    score = self.analyze_text(article['title'] + ' ' + article['content'], symbol)
                    if score:
                        score.source = feed_url
                        score.url = article.get('url')
                        sentiment_scores.append(score)
                        
            except Exception as e:
                logger.error(f"Error fetching from {feed_url}: {e}")
        
        # Sort by timestamp and limit
        sentiment_scores.sort(key=lambda x: x.timestamp, reverse=True)
        return sentiment_scores[:max_articles]
    
    def _fetch_rss_feed(self, feed_url: str, max_articles: int = 20) -> List[Dict]:
        """Fetch articles from RSS feed"""
        try:
            import feedparser
            
            # Parse RSS feed
            feed = feedparser.parse(feed_url)
            articles = []
            
            for entry in feed.entries[:max_articles]:
                # Get content
                content = ""
                if hasattr(entry, 'content') and entry.content:
                    content = entry.content[0].value if isinstance(entry.content, list) else entry.content.value
                elif hasattr(entry, 'summary'):
                    content = entry.summary
                elif hasattr(entry, 'description'):
                    content = entry.description
                
                articles.append({
                    'title': entry.title or "",
                    'content': content or "",
                    'url': entry.link,
                    'published': datetime(*entry.published_parsed[:6]) if hasattr(entry, 'published_parsed') and entry.published_parsed else datetime.now()
                })
            
            logger.info(f"Fetched {len(articles)} articles from {feed_url}")
            return articles
            
        except ImportError:
            logger.error("feedparser not installed - pip install feedparser")
            return []
        except Exception as e:
            logger.error(f"Error parsing RSS feed {feed_url}: {e}")
            return []
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for sentiment analysis"""
        if not text:
            return ""
        
        # Remove URLs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Remove email addresses
        text = re.sub(r'\S+@\S+', '', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Remove special characters but keep punctuation important for sentiment
        text = re.sub(r'[^\w\s\.\!\?\,\;\:\-]', '', text)
        
        return text
    
    def _is_crypto_relevant(self, text: str) -> bool:
        """Check if text is relevant to cryptocurrency"""
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in self.crypto_keywords)
    
    def get_sentiment_summary(self, symbol: str = None, hours: int = 24) -> Dict:
        """Get sentiment summary for a symbol or overall"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        # Get recent sentiment scores
        if symbol:
            scores = [s for s in self.sentiment_cache.get(symbol, []) 
                      if s.timestamp > cutoff_time]
        else:
            all_scores = []
            for symbol_scores in self.sentiment_cache.values():
                all_scores.extend([s for s in symbol_scores if s.timestamp > cutoff_time])
            scores = all_scores
        
        if not scores:
            return {
                'count': 0,
                'avg_score': 0.0,
                'positive_count': 0,
                'negative_count': 0,
                'neutral_count': 0,
                'avg_confidence': 0.0
            }
        
        # Calculate metrics
        total_score = sum(s.score for s in scores)
        avg_score = total_score / len(scores)
        
        sentiment_counts = {
            SentimentLabel.POSITIVE: sum(1 for s in scores if s.sentiment == SentimentLabel.POSITIVE),
            SentimentLabel.NEGATIVE: sum(1 for s in scores if s.sentiment == SentimentLabel.NEGATIVE),
            SentimentLabel.NEUTRAL: sum(1 for s in scores if s.sentiment == SentimentLabel.NEUTRAL)
        }
        
        avg_confidence = sum(s.confidence for s in scores) / len(scores)
        
        return {
            'count': len(scores),
            'avg_score': avg_score,
            'positive_count': sentiment_counts[SentimentLabel.POSITIVE],
            'negative_count': sentiment_counts[SentimentLabel.NEGATIVE],
            'neutral_count': sentiment_counts[SentimentLabel.NEUTRAL],
            'avg_confidence': avg_confidence,
            'sentiment_distribution': {
                'positive': sentiment_counts[SentimentLabel.POSITIVE] / len(scores) * 100,
                'negative': sentiment_counts[SentimentLabel.NEGATIVE] / len(scores) * 100,
                'neutral': sentiment_counts[SentimentLabel.NEUTRAL] / len(scores) * 100
            }
        }
    
    def update_cache(self, symbol: str, scores: List[SentimentScore]):
        """Update sentiment cache"""
        if symbol not in self.sentiment_cache:
            self.sentiment_cache[symbol] = []
        
        # Add new scores
        self.sentiment_cache[symbol].extend(scores)
        
        # Remove old scores
        cutoff_time = datetime.now() - timedelta(hours=self.cache_duration_hours)
        self.sentiment_cache[symbol] = [
            s for s in self.sentiment_cache[symbol] 
            if s.timestamp > cutoff_time
        ]
        
        logger.info(f"Updated sentiment cache for {symbol}: {len(self.sentiment_cache[symbol])} entries")
    
    def get_hourly_sentiment(self, symbol: str = None, hours: int = 24) -> pd.DataFrame:
        """Get hourly sentiment data for analysis"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        if symbol:
            scores = [s for s in self.sentiment_cache.get(symbol, []) 
                      if s.timestamp > cutoff_time]
        else:
            all_scores = []
            for symbol_scores in self.sentiment_cache.values():
                all_scores.extend([s for s in symbol_scores if s.timestamp > cutoff_time])
            scores = all_scores
        
        if not scores:
            return pd.DataFrame()
        
        # Create hourly aggregation
        df = pd.DataFrame([{
            'timestamp': s.timestamp.replace(minute=0, second=0, microsecond=0),
            'sentiment_score': s.score,
            'confidence': s.confidence,
            'sentiment': s.sentiment.value
        } for s in scores])
        
        # Group by hour
        hourly_df = df.groupby('timestamp').agg({
            'sentiment_score': 'mean',
            'confidence': 'mean',
            'sentiment': lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else 'NEUTRAL'
        }).reset_index()
        
        return hourly_df
    
    def should_trade_based_on_sentiment(self, symbol: str = None, 
                                     threshold: float = 0.1) -> Tuple[bool, str]:
        """Determine if sentiment supports trading"""
        summary = self.get_sentiment_summary(symbol, hours=6)  # Last 6 hours
        
        if summary['count'] < 5:  # Need minimum data points
            return False, "Insufficient sentiment data"
        
        avg_score = summary['avg_score']
        confidence = summary['avg_confidence']
        
        if confidence < 0.6:  # Need minimum confidence
            return False, f"Low confidence: {confidence:.2f}"
        
        if abs(avg_score) < threshold:  # Sentiment too neutral
            return False, f"Neutral sentiment: {avg_score:.3f}"
        
        direction = "LONG" if avg_score > 0 else "SHORT"
        reason = f"Strong {direction.lower()} sentiment: {avg_score:.3f}"
        
        return True, reason

# Global sentiment analyzer instance
sentiment_analyzer = FinBERTSentimentAnalyzer()
