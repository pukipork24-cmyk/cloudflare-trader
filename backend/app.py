"""Flask application factory"""
import os
import logging
from flask import Flask
from flask_cors import CORS
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app(config_name='production'):
    """Create and configure Flask app"""
    from config.settings import config
    from models.database import db, init_db

    app = Flask(__name__)
    app.config.from_object(config.get(config_name, config['production']))

    # Initialize extensions
    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    with app.app_context():
        try:
            # Create tables
            init_db(app)
            logger.info("✓ Database initialized")
        except Exception as e:
            logger.warning(f"⚠️ Database init failed (will retry): {e}")

        try:
            # Register blueprints
            from api.routes import api_bp
            app.register_blueprint(api_bp, url_prefix='/api')
            logger.info("✓ API routes registered")
        except Exception as e:
            logger.error(f"✗ API routes failed: {e}")

        try:
            # Initialize scheduler
            if config_name != 'testing':
                from orchestrator.scheduler import init_scheduler
                init_scheduler(app)
                logger.info("✓ Scheduler initialized")
        except Exception as e:
            logger.warning(f"⚠️ Scheduler init failed: {e}")

        try:
            # Initialize evolution scheduler
            if config_name != 'testing':
                from evolution.scheduler import init_evolution_scheduler
                init_evolution_scheduler(app)
                logger.info("✓ Evolution scheduler initialized")
        except Exception as e:
            logger.warning(f"⚠️ Evolution scheduler init failed: {e}")

        logger.info(f"✓ App initialized ({config_name} mode)")

    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        return {'error': 'Not found'}, 404

    @app.errorhandler(500)
    def internal_error(e):
        logger.error(f"Internal error: {e}")
        return {'error': 'Internal server error'}, 500

    @app.route('/health')
    def health():
        return {'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()}

    return app

if __name__ == '__main__':
    from config.settings import Config
    Config.validate()
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)
