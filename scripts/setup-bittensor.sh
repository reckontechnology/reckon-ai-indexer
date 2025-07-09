#!/bin/bash

# Reckon AI Indexer - Bittensor Setup Script
echo "Setting up Bittensor Subnet 18 integration..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check Python version
python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "Python version: $python_version"

# Create Python virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install Bittensor and dependencies
echo "Installing Bittensor dependencies..."
pip install -r requirements.txt

# Install additional dependencies for development
echo "Installing additional dependencies..."
pip install wheel setuptools

# Create .env file with Bittensor configuration if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file with Bittensor configuration..."
    cat > .env << EOF
# Bittensor Configuration
BITTENSOR_WALLET_NAME=reckon
BITTENSOR_WALLET_HOTKEY=default
BITTENSOR_NETWORK=finney

# Other configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/reckon
REDIS_URL=redis://localhost:6379

# API Keys (add your keys here)
CHAINLINK_API_KEY=your_chainlink_api_key
PYTH_API_KEY=your_pyth_api_key
EOF
    echo "Created .env file. Please update it with your configuration."
fi

# Make Python bridge executable
chmod +x scripts/bittensor_bridge.py

echo "Bittensor setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your Bittensor wallet configuration"
echo "2. Ensure you have a Bittensor wallet set up: 'btcli wallet create'"
echo "3. Fund your wallet if needed for network interactions"
echo "4. Start the application: 'npm run dev'"
echo ""
echo "Note: For production use, ensure your Bittensor wallet is properly configured"
echo "and funded for network operations on Subnet 18."
