"""Authentication and authorization"""
from functools import wraps
from flask import request, jsonify
import hashlib
import logging

logger = logging.getLogger(__name__)

def verify_password(password, password_hash):
    """Verify password against hash"""
    return hashlib.sha256(password.encode()).hexdigest() == password_hash

def require_auth(f):
    """Decorator for protected endpoints"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

        if not token:
            return {'error': 'Missing authorization token'}, 401

        # TODO: Verify token (JWT or session)
        # For now, accept any non-empty token
        if len(token) < 10:
            return {'error': 'Invalid token'}, 401

        return f(*args, **kwargs)

    return decorated

def login_user(email, password):
    """Authenticate user"""
    from config.settings import Config

    if email != Config.ADMIN_EMAIL:
        return None

    # TODO: Implement proper password verification
    # For now, just check config
    return {'email': email, 'token': 'admin-token-123'}
