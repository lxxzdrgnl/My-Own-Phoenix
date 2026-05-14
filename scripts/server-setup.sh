#!/bin/bash
set -e

echo "=== My Own Phoenix — Server Setup ==="

# Create project directory
mkdir -p ~/servers/my-own-phoenix
cd ~/servers/my-own-phoenix

# Clone repo (if not already)
if [ ! -d "repo" ]; then
  echo "Cloning repository..."
  git clone https://github.com/lxxzdrgnl/my-own-phoenix.git repo
fi

# Create Phoenix data directory
mkdir -p ~/.phoenix

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "1. Create PostgreSQL database:"
echo "   sudo -u postgres createdb phoenix_prod"
echo ""
echo "2. Copy .env file to ~/servers/my-own-phoenix/.env"
echo ""
echo "3. Start services:"
echo "   cd ~/servers/my-own-phoenix/repo"
echo "   docker compose up -d"
echo ""
echo "4. Configure GitHub Secrets:"
echo "   PC_SSH_KEY, PC_SSH_HOST, PC_SSH_USER, APP_ENV"
