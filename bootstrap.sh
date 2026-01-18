#!/bin/bash

# Bootstrap script for Silicon Smackdown
echo "🎙️  Starting Silicon Smackdown..."

# Check if API key is set
if grep -q "PLACEHOLDER_API_KEY" .env.local; then
    echo "⚠️  WARNING: API key is still set to placeholder"
    echo "   Please replace PLACEHOLDER_API_KEY in .env.local with your actual Gemini API key"
    echo "   Get one from: https://aistudio.google.com/apikey"
    echo ""
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Kill any existing processes on port 3014
echo "🔧 Checking port 3014..."
lsof -ti:3014 | xargs kill -9 2>/dev/null || true

# Start the dev server on port 3014
echo "🚀 Launching app on http://localhost:3014"
echo "   Press Ctrl+C to stop"
echo ""

# Start the dev server on port 3014
npx vite --port 3014
