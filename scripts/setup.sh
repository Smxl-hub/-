#!/bin/bash
# HotPulse 最新情报站 — First-time Setup
# Usage: bash scripts/setup.sh

set -e

echo "================================================"
echo "  🛠️  HotPulse 最新情报站 — Setup"
echo "================================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install Docker first:"
    echo "   https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo "❌ docker compose not available. Check Docker installation."
    exit 1
fi

echo "✅ Docker $(docker --version) found"
echo ""

# Create .env if missing
if [ ! -f server/.env ]; then
    echo "📝 Creating server/.env from template..."
    cp server/.env.example server/.env
    echo "⚠️  Please edit server/.env and add your API keys:"
    echo "   - OPENROUTER_API_KEY (required — AI analysis)"
    echo "   - TWITTER_API_KEY (optional — Twitter search)"
    echo "   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optional — notifications)"
    echo ""
    echo "Then re-run: bash scripts/deploy.sh"
    exit 0
fi

echo "✅ server/.env found"
echo ""

# Install deps and build
echo "🔨 Building project..."
docker compose build

echo ""
echo "================================================"
echo "  ✅ Setup Complete!"
echo "================================================"
echo ""
echo "  ▶️  Deploy: bash scripts/deploy.sh"
echo "  🧪 Test sources: docker compose exec server npx tsx src/test-sources.ts"
echo ""
