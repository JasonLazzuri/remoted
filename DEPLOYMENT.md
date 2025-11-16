# Deployment Guide for Remoted Signaling Server

This guide covers deploying the signaling server to cloud platforms for production use.

## Prerequisites

1. Git repository initialized (see below)
2. Account on Railway or fly.io
3. Command-line tools installed (optional but recommended)

## Option 1: Deploy to Railway (Recommended - Easiest)

Railway offers the simplest deployment with automatic HTTPS/WSS support.

### Steps:

1. **Initialize Git (if not already done):**
   ```bash
   cd /Users/ttadmin/Remoted
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Sign up for Railway:**
   - Go to https://railway.app
   - Sign up with GitHub (free tier: $5 credit/month)

3. **Deploy via Web Interface:**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect the Dockerfile
   - Set root directory to `signaling-server`
   - Add environment variable: `PORT` (Railway provides this automatically)
   - Deploy!

4. **Configure Environment:**
   - In Railway dashboard, go to your service
   - Click "Variables" tab
   - Add: `NODE_ENV=production`
   - Railway automatically provides SSL/WSS

5. **Get Your URL:**
   - Railway will provide a URL like `https://remoted-signaling-production.up.railway.app`
   - Your WebSocket URL will be `wss://remoted-signaling-production.up.railway.app`

6. **Update Your Apps:**
   - Update `.env` files in `host-app` and `client-app`:
   ```
   SIGNALING_SERVER=wss://your-railway-url.railway.app
   ```

### Railway Deployment (CLI Method):

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd signaling-server
railway init

# Deploy
railway up
```

---

## Option 2: Deploy to fly.io

Fly.io offers more control and is also free-tier friendly.

### Steps:

1. **Install flyctl:**
   ```bash
   # macOS
   brew install flyctl

   # Or use install script
   curl -L https://fly.io/install.sh | sh
   ```

2. **Sign up and login:**
   ```bash
   fly auth signup
   # or
   fly auth login
   ```

3. **Deploy:**
   ```bash
   cd /Users/ttadmin/Remoted/signaling-server

   # Launch (uses existing fly.toml)
   fly launch --config fly.toml

   # Deploy
   fly deploy
   ```

4. **Get Your URL:**
   ```bash
   fly status
   ```
   Your URL will be like `https://remoted-signaling-server.fly.dev`
   WebSocket URL: `wss://remoted-signaling-server.fly.dev`

5. **Update Your Apps:**
   Update `.env` files in `host-app` and `client-app`:
   ```
   SIGNALING_SERVER=wss://remoted-signaling-server.fly.dev
   ```

---

## Initialize Git Repository (Required)

Both platforms require a git repository:

```bash
cd /Users/ttadmin/Remoted

# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Remoted app ready for deployment"

# (Optional) Add remote repository
git remote add origin <your-github-repo-url>
git push -u origin main
```

---

## Testing Your Deployment

After deployment, test the WebSocket connection:

```bash
# Using wscat (install with: npm install -g wscat)
wscat -c wss://your-deployed-url

# You should see connection established
# Try sending a test message
```

---

## Cost Comparison

### Railway
- **Free Tier**: $5 credit/month (enough for ~500 hours of uptime)
- **Pros**: Easiest setup, auto-SSL, GitHub integration
- **Cons**: Limited free tier hours

### fly.io
- **Free Tier**: Up to 3 shared-cpu-1x VMs with 256MB RAM (always free)
- **Pros**: More generous free tier, good performance
- **Cons**: Slightly more complex setup

---

## Troubleshooting

### Railway Issues:
- Check logs in Railway dashboard
- Ensure `PORT` environment variable is set (Railway provides this)
- Verify Dockerfile path is correct

### fly.io Issues:
```bash
# View logs
fly logs

# SSH into machine
fly ssh console

# Check status
fly status
```

### General Issues:
- Ensure WebSocket connections use `wss://` not `ws://`
- Check firewall/security settings
- Verify environment variables are set correctly

---

## Next Steps

After deploying the signaling server:

1. Set up TURN server for NAT traversal (see TURN_SETUP.md)
2. Update client and host apps with production signaling server URL
3. Build and distribute desktop applications
4. Test connections across different networks
