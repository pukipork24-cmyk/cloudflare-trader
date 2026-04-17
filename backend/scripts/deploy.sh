#!/bin/bash

# Deployment script for Fly.io

set -e

echo "🚀 Deploying Trading Bot to Fly.io"

# Check OS
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ This script requires Ubuntu/Linux"
    exit 1
fi

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# Install Fly CLI
if ! command -v flyctl &> /dev/null; then
    echo "📦 Installing Fly CLI..."
    curl -L https://fly.io/install.sh | sh
fi

# Create fly.toml
echo "📝 Creating fly.toml..."
cat > fly.toml << 'EOF'
app = "pukitradev2"
primary_region = "sjc"

[build]
  image = "python:3.11"

[env]
  PYTHONUNBUFFERED = "true"

[[services]]
  internal_port = 5000
  processes = ["app"]

  [services.tcp_checks]
    enabled = true
    grace_period = "5s"
    interval = "15s"
    timeout = "2s"
EOF

# Initialize Fly app
echo "🔐 Authenticating with Fly..."
flyctl auth login

# Create app
echo "📦 Creating Fly app..."
flyctl launch --name pukitradev2 --region sjc --no-deploy

# Set secrets
echo "🔑 Setting secrets..."
flyctl secrets set GROQ_API_KEY=$GROQ_API_KEY
flyctl secrets set BITGET_API_KEY=$BITGET_API_KEY
flyctl secrets set BITGET_SECRET_KEY=$BITGET_SECRET_KEY
flyctl secrets set BITGET_PASSPHRASE=$BITGET_PASSPHRASE
flyctl secrets set DATABASE_URL=$DATABASE_URL
flyctl secrets set REDIS_URL=$REDIS_URL

# Deploy
echo "🚀 Deploying..."
flyctl deploy

echo "✅ Deployment complete!"
echo "🌐 App URL: https://pukitradev2.fly.dev"
echo "📊 Dashboard: https://yourcloudflaredomain.com"
