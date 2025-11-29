#!/bin/bash

# Enhanced Knowledge Graph Intelligence - Test Runner
# Simple script to run all tests

echo "🚀 Enhanced Knowledge Graph Intelligence - Test Runner"
echo "=================================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if required environment variables are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Required environment variables not set:"
    echo "   - NEXT_PUBLIC_SUPABASE_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY"
    echo ""
    echo "Please set these environment variables and try again."
    exit 1
fi

echo "✅ Environment variables configured"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run the comprehensive test suite
echo "🧪 Running comprehensive test suite..."
echo ""

node run_all_tests.js

echo ""
echo "🏁 Test execution completed!"
