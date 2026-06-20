#!/bin/bash
# HotPulse 最新情报站 — Production Deploy Script
# Usage: bash scripts/deploy.sh

set -e

echo "================================================"
echo "  🚀 HotPulse 最新情报站 — Deploy"
echo "================================================"
echo ""

# Check .env exists
if [ ! -f server/.env ]; then
    echo "❌ server/.env not found!"
    echo "   Copy server/.env.example → server/.env and fill in your keys"
    exit 1
fi

# Check required env vars
echo "📋 Checking configuration..."
grep -q "your_openrouter_api_key_here" server/.env && echo "⚠️  OPENROUTER_API_KEY not configured!" || echo "✅ OPENROUTER_API_KEY configured"

# Build images
echo ""
echo "🔨 Building Docker images..."
docker compose build --no-cache

# Start services
echo ""
echo "▶️  Starting services..."
docker compose up -d

# Wait for health check
echo ""
echo "⏳ Waiting for server to be healthy..."
for i in $(seq 1 15); do
    if curl -sf http://localhost:${HOST_PORT:-8080}/api/health > /dev/null 2>&1; then
        echo "✅ Server is healthy!"
        break
    fi
    sleep 2
    echo "   ...$((i*2))s"
done

# Show status
echo ""
echo "================================================"
echo "  ✅ Deployment Complete"
echo "================================================"
echo ""
echo "  🌐 Dashboard: http://localhost:${HOST_PORT:-8080}"
echo "  🩺 API Health: http://localhost:${HOST_PORT:-8080}/api/health"
echo ""
echo "  📋 Useful commands:"
echo "     docker compose logs -f     # Follow logs"
echo "     docker compose ps          # Service status"
echo "     docker compose down        # Stop services"
echo "     bash scripts/deploy.sh     # Re-deploy"
echo ""
