#!/bin/bash
set -e

SERVER="ubuntu@51.159.158.173"
REMOTE_DIR="oab-chain"

echo "=== OAB Chain Deploy ==="

# --- 1. Install Docker on server if needed ---
echo "Checking Docker on server..."
if ! ssh "$SERVER" "docker --version" &>/dev/null; then
    echo "Installing Docker on server..."
    ssh "$SERVER" bash -s <<'INSTALL'
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl
        sudo install -m 0755 -d /etc/apt/keyrings
        sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        sudo chmod a+r /etc/apt/keyrings/docker.asc
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        sudo usermod -aG docker ubuntu
INSTALL
    echo "Docker installed."
fi

# --- 2. Set up swap if not present (2GB RAM is tight for Substrate) ---
echo "Checking swap on server..."
ssh "$SERVER" bash -s <<'SWAP'
    if [ "$(swapon --show | wc -l)" -eq 0 ]; then
        echo "Creating 4GB swap file..."
        sudo fallocate -l 4G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        echo "Swap enabled."
    else
        echo "Swap already configured."
    fi
SWAP

# --- 3. Copy files to server ---
echo "Copying files to server..."
ssh "$SERVER" "mkdir -p ~/$REMOTE_DIR"
scp blockchain/Dockerfile blockchain/docker-compose.yml blockchain/chain_spec.json "$SERVER:~/$REMOTE_DIR/"

# --- 4. Build and deploy on server ---
echo "Building image and starting node on server..."
ssh "$SERVER" bash -s <<DEPLOY
    cd ~/$REMOTE_DIR
    sudo docker build -t oab-chain:latest .
    sudo docker compose down 2>/dev/null || true
    sudo docker compose up -d
DEPLOY

echo ""
echo "=== Deploy complete ==="
echo "Node RPC/WS: ws://51.159.158.173:9944"
echo ""
echo "Useful commands:"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose logs -f'    # view logs"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose restart'    # restart node"
echo "  ssh $SERVER 'cd ~/$REMOTE_DIR && sudo docker compose down'       # stop node"
