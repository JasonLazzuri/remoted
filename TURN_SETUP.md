# TURN Server Setup Guide

TURN (Traversal Using Relays around NAT) servers are essential for WebRTC connections when peers are behind restrictive firewalls or symmetric NATs. Without TURN, many connections across different networks will fail.

## Why You Need TURN

- **STUN** works for ~85% of connections (when NAT is permissive)
- **TURN** is needed for the remaining ~15% (strict NATs, corporate firewalls)
- For enterprise deployment, TURN is **essential**

## Option 1: Metered.ca (Recommended - Free Tier Available)

Metered.ca offers a generous free tier perfect for testing and small deployments.

### Free Tier:
- 50 GB/month bandwidth
- Unlimited concurrent users
- Global TURN servers
- STUN + TURN included

### Setup:

1. **Sign Up:**
   - Go to https://www.metered.ca/stun-turn
   - Click "Try for Free"
   - Create account

2. **Get Credentials:**
   - After signup, you'll see your dashboard
   - Copy the TURN server configuration:
     ```
     URLs: turn:a.relay.metered.ca:80
           turn:a.relay.metered.ca:80?transport=tcp
           turn:a.relay.metered.ca:443
           turn:a.relay.metered.ca:443?transport=tcp
     Username: <your-username>
     Credential: <your-password>
     ```

3. **Update Your .env Files:**

   **host-app/.env:**
   ```env
   SIGNALING_SERVER=wss://your-server.railway.app
   TURN_SERVER_URL=turn:a.relay.metered.ca:443
   TURN_SERVER_USERNAME=your-metered-username
   TURN_SERVER_CREDENTIAL=your-metered-password
   NODE_ENV=production
   ```

   **client-app/.env:**
   ```env
   SIGNALING_SERVER=wss://your-server.railway.app
   TURN_SERVER_URL=turn:a.relay.metered.ca:443
   TURN_SERVER_USERNAME=your-metered-username
   TURN_SERVER_CREDENTIAL=your-metered-password
   NODE_ENV=production
   ```

4. **Test Your Setup:**
   - Use the Trickle ICE test: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   - Enter your TURN credentials
   - You should see "relay" candidates appear

---

## Option 2: Self-Hosted TURN Server (coturn)

For more control or higher bandwidth needs, you can self-host a TURN server using coturn.

### Requirements:
- Linux server (VPS from DigitalOcean, Hetzner, etc.)
- Public IP address
- Open ports: 3478 (UDP/TCP), 443 (TCP), 49152-65535 (UDP)

### Setup on Ubuntu/Debian:

1. **Install coturn:**
   ```bash
   sudo apt update
   sudo apt install coturn
   ```

2. **Configure coturn:**
   ```bash
   sudo nano /etc/turnserver.conf
   ```

   Add:
   ```conf
   # Basic settings
   listening-port=3478
   fingerprint
   lt-cred-mech
   use-auth-secret
   static-auth-secret=YOUR_RANDOM_SECRET_HERE
   realm=yourdomain.com

   # Logging
   verbose
   log-file=/var/log/turnserver.log

   # Network settings
   external-ip=YOUR_SERVER_PUBLIC_IP
   relay-ip=YOUR_SERVER_PRIVATE_IP

   # Security
   no-multicast-peers
   no-cli

   # Port ranges
   min-port=49152
   max-port=65535

   # SSL/TLS (optional but recommended)
   # cert=/etc/letsencrypt/live/yourdomain.com/cert.pem
   # pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem
   ```

3. **Enable and start coturn:**
   ```bash
   sudo systemctl enable coturn
   sudo systemctl start coturn
   ```

4. **Generate credentials:**
   ```bash
   # Install turnadmin if not available
   timestamp=$(date +%s)
   username="${timestamp}:myuser"
   secret="YOUR_RANDOM_SECRET_HERE"
   password=$(echo -n "${username}" | openssl dgst -binary -sha1 -hmac "${secret}" | base64)

   echo "Username: ${username}"
   echo "Password: ${password}"
   ```

5. **Update .env files:**
   ```env
   TURN_SERVER_URL=turn:your-server-ip:3478
   TURN_SERVER_USERNAME=<generated-username>
   TURN_SERVER_CREDENTIAL=<generated-password>
   ```

---

## Option 3: Twilio TURN (Pay-as-you-go)

Twilio offers TURN servers as part of their Network Traversal Service.

### Pricing:
- $0.0004 per participant minute
- Good for production, scales automatically

### Setup:

1. **Sign up at Twilio:**
   - https://www.twilio.com/stun-turn

2. **Get API credentials:**
   - From Twilio Console, get Account SID and Auth Token

3. **Generate TURN credentials dynamically:**
   - Twilio uses temporary credentials generated via API
   - You'll need to request new credentials periodically
   - See Twilio docs: https://www.twilio.com/docs/stun-turn

---

## Testing Your TURN Server

### Method 1: Trickle ICE
1. Go to https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Remove default servers
3. Add your TURN server details
4. Click "Gather candidates"
5. Look for "relay" type candidates - these confirm TURN is working

### Method 2: Command Line Test
```bash
# Install turnutils
sudo apt install coturn-utils

# Test TURN server
turnutils_uclient -v -u USERNAME -w PASSWORD your-turn-server.com
```

---

## Bandwidth Estimates

For planning TURN server capacity:

- Screen sharing at 1080p: ~2-5 Mbps
- Per connection hour: ~900 MB - 2.25 GB
- 50 GB/month (Metered free tier): ~22-55 connection hours

---

## Troubleshooting

### No relay candidates appearing:
- Check firewall rules on TURN server
- Verify ports 3478 and 49152-65535 are open
- Test with turnutils_uclient
- Check TURN server logs

### TURN working but connections still failing:
- Verify WebRTC configuration in apps
- Check browser/Electron console for ICE errors
- Ensure both peers can reach TURN server

### High bandwidth usage:
- TURN is only used when direct connection fails
- Most connections should use STUN (direct P2P)
- Monitor connection types in WebRTC stats

---

## Recommended Setup

For your company deployment:

1. **Start with Metered.ca free tier** for testing
2. **Monitor usage** for first month
3. **Upgrade or self-host** based on needs:
   - < 50 GB/month: Stay on Metered.ca free
   - 50-500 GB/month: Metered.ca paid ($29/month for 500GB)
   - > 500 GB/month: Self-host coturn on VPS

---

## Next Steps

After setting up TURN:

1. Update .env files in both apps with TURN credentials
2. Rebuild applications
3. Test connections across different networks
4. Deploy to production
