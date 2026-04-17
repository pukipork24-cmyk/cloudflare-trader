"""Initialize database with seed data"""
from app import create_app
from models.database import db, User
import hashlib

app = create_app('production')

with app.app_context():
    db.drop_all()
    db.create_all()

    # Create admin user
    from config.settings import Config

    password_hash = hashlib.sha256(Config.ADMIN_EMAIL.encode()).hexdigest()

    admin = User(
        email=Config.ADMIN_EMAIL,
        password_hash=password_hash,
        is_active=True
    )

    db.session.add(admin)
    db.session.commit()

    print(f"✓ Database initialized")
    print(f"✓ Admin user created: {Config.ADMIN_EMAIL}")
