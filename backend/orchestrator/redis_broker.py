"""Redis pub/sub for agent communication"""
import redis
import json
from config.settings import Config
import logging

logger = logging.getLogger(__name__)

class RedisBroker:
    """Publish/subscribe message broker"""

    def __init__(self):
        try:
            self.redis = redis.from_url(Config.REDIS_URL)
            self.redis.ping()
            logger.info("✓ Redis connected")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            self.redis = None

    def publish(self, channel, data):
        """Publish message to channel"""
        if not self.redis:
            return False

        try:
            message = json.dumps(data) if isinstance(data, dict) else str(data)
            self.redis.publish(channel, message)
            logger.debug(f"Published to {channel}")
            return True
        except Exception as e:
            logger.error(f"Publish error: {e}")
            return False

    def subscribe(self, channels):
        """Subscribe to channels"""
        if not self.redis:
            return None

        try:
            pubsub = self.redis.pubsub()
            pubsub.subscribe(channels)
            logger.info(f"Subscribed to {channels}")
            return pubsub
        except Exception as e:
            logger.error(f"Subscribe error: {e}")
            return None

    def listen(self, pubsub):
        """Listen for messages"""
        if not pubsub:
            return

        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data']) if isinstance(message['data'], bytes) else message['data']
                    yield data
                except Exception as e:
                    logger.error(f"Message parse error: {e}")

broker = RedisBroker()
