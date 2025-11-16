# Remoted - Professional Remote Desktop Application

A professional-grade remote desktop application built with Electron and WebRTC, allowing you to remotely access computers across different networks. Inspired by LogMeIn.

## Features

- **Cross-Network Access**: Connect to computers on different networks using WebRTC with NAT traversal
- **Real-time Screen Sharing**: High-quality screen streaming with adaptive bitrate
- **Full Remote Control**: Control mouse and keyboard on remote computers
- **Secure Connections**: End-to-end encryption via WebRTC (DTLS-SRTP)
- **Cross-Platform**: Works on Windows and macOS
- **Simple Architecture**: Central signaling server coordinates peer-to-peer connections

## Architecture

The application consists of three main components:

1. **Signaling Server** (`signaling-server/`): Node.js WebSocket server that coordinates connections
2. **Host Application** (`host-app/`): Electron app installed on computers you want to access
3. **Client Application** (`client-app/`): Electron app used to connect to remote hosts

### How It Works

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Client    │◄────────┤ Signaling Server ├────────►│    Host     │
│     App     │ WebSocket│   (Coordinate)   │WebSocket│     App     │
└──────┬──────┘         └──────────────────┘         └──────┬──────┘
       │                                                      │
       │              WebRTC P2P Connection                   │
       │         (Video Stream + Control Channel)            │
       └──────────────────────────────────────────────────────┘
```

1. Host registers with signaling server and appears as "online"
2. Client requests connection to a specific host
3. Signaling server facilitates WebRTC handshake (offer/answer/ICE)
4. Direct P2P connection established (or relayed via TURN if needed)
5. Host streams screen, client sends mouse/keyboard commands

## Prerequisites

- **Node.js** 18+ and npm
- **macOS or Windows** (for running the Electron apps)
- **Python 2.7** (required by robotjs for building native modules)

### macOS-specific Requirements

For the host app to control mouse/keyboard, you need to grant accessibility permissions:

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install
```

## Installation

### 1. Install Dependencies

From the project root:

```bash
npm install
```

This will install dependencies for all workspaces (signaling-server, host-app, client-app, shared).

### 2. Build All Packages

```bash
npm run build:all
```

This compiles TypeScript for all components.

## Usage

### Step 1: Start the Signaling Server

In one terminal window:

```bash
npm run server
```

The server will start on `ws://localhost:8080` by default.

**Note**: For production use or testing across different networks, deploy this server to a public VPS and set the `SIGNALING_SERVER` environment variable in the host and client apps.

### Step 2: Start the Host Application

On the computer you want to access remotely:

```bash
npm run host
```

The host app will:
- Connect to the signaling server
- Register as an available device
- Wait for incoming connections

**macOS**: You'll need to grant screen recording and accessibility permissions when prompted.

### Step 3: Start the Client Application

On the computer you want to use to connect:

```bash
npm run client
```

The client app will:
- Connect to the signaling server
- Display list of available devices
- Allow you to connect to any online host

### Step 4: Connect

1. In the client app, you'll see a list of available devices
2. Click "Connect" on the device you want to access
3. Wait for the connection to establish (status will show "CONNECTED")
4. Click "Enable Control" to start controlling the remote computer
5. Click on the video to focus, then use your mouse and keyboard

## Development

### Running in Development Mode

Each component can be run separately in development:

```bash
# Terminal 1 - Signaling Server
cd signaling-server
npm run dev

# Terminal 2 - Host App
cd host-app
npm run dev

# Terminal 3 - Client App
cd client-app
npm run dev
```

### Project Structure

```
remoted/
├── signaling-server/       # WebSocket signaling server
│   ├── src/
│   │   └── server.ts      # Main server logic
│   └── package.json
├── host-app/              # Host Electron application
│   ├── src/
│   │   ├── main.ts       # Electron main process
│   │   ├── renderer.ts   # Renderer process (WebRTC)
│   │   └── renderer.html # UI
│   └── package.json
├── client-app/            # Client Electron application
│   ├── src/
│   │   ├── main.ts       # Electron main process
│   │   ├── renderer.ts   # Renderer process (WebRTC)
│   │   └── renderer.html # UI
│   └── package.json
├── shared/                # Shared TypeScript types
│   ├── src/
│   │   ├── types.ts      # Message and control types
│   │   └── index.ts
│   └── package.json
└── package.json          # Root package (workspace config)
```

## Building for Production

### Package Desktop Applications

```bash
# Build and package Host app for macOS
cd host-app
npm run package:mac

# Build and package Host app for Windows
npm run package:win

# Build and package Client app for macOS
cd client-app
npm run package:mac

# Build and package Client app for Windows
npm run package:win
```

The packaged applications will be in the `dist/` folder of each app.

### Deploy Signaling Server

For production use, deploy the signaling server to a cloud VPS:

1. Choose a provider (AWS Lightsail, DigitalOcean, etc.)
2. Set up a server with Node.js
3. Copy the `signaling-server` folder
4. Install dependencies and build:
   ```bash
   cd signaling-server
   npm install
   npm run build
   ```
5. Run with PM2 or similar:
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name remoted-signaling
   ```
6. Update host and client apps to use your server:
   ```bash
   SIGNALING_SERVER=wss://your-server.com npm run host
   SIGNALING_SERVER=wss://your-server.com npm run client
   ```

## Configuration

### Environment Variables

- `SIGNALING_SERVER`: WebSocket URL for signaling server (default: `ws://localhost:8080`)
- `PORT`: Port for signaling server (default: `8080`)

### Changing Server Address

Edit the apps before building for production:

**host-app/src/main.ts** and **client-app/src/main.ts**:
```typescript
const SIGNALING_SERVER = process.env.SIGNALING_SERVER || 'wss://your-production-server.com';
```

## Troubleshooting

### Host App Issues

**Problem**: Screen not being captured
- **Solution**: Grant screen recording permissions in System Preferences > Security & Privacy > Screen Recording (macOS)

**Problem**: Mouse/keyboard control not working
- **Solution**: Grant accessibility permissions in System Preferences > Security & Privacy > Accessibility (macOS)

**Problem**: RobotJS build errors
- **Solution**: Ensure you have Python 2.7 and build tools installed:
  ```bash
  # macOS
  xcode-select --install

  # Windows
  npm install --global windows-build-tools
  ```

### Connection Issues

**Problem**: Client can't see host devices
- **Solution**: Ensure both apps are connected to the same signaling server. Check the status indicator shows "ONLINE"

**Problem**: Connection fails or shows "CONNECTING" forever
- **Solution**:
  - Check firewall settings
  - Ensure STUN servers are accessible
  - Consider adding a TURN server for more restrictive networks

**Problem**: Connection established but no video
- **Solution**: Check console for errors. Ensure host has screen capture permissions.

### WebRTC Issues

For connections across very restrictive networks, you may need to add TURN servers to relay traffic:

Edit the `RTCPeerConnection` configuration in both `host-app/src/renderer.ts` and `client-app/src/renderer.ts`:

```typescript
this.peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password'
    }
  ],
});
```

## Security Considerations

- All video and control data is encrypted via WebRTC (DTLS-SRTP)
- Currently uses device IDs for authentication (MVP version)
- For production, consider adding:
  - User accounts with email/password
  - Two-factor authentication
  - Session tokens
  - Connection approval prompts on host
  - Connection logging and monitoring

## Future Enhancements

Phase 2 features to consider:
- [ ] File transfer between computers
- [ ] Clipboard synchronization
- [ ] Multi-monitor support
- [ ] Session recording
- [ ] Chat/messaging between client and host
- [ ] Connection quality indicators
- [ ] Bandwidth usage statistics
- [ ] Mobile apps (iOS/Android)
- [ ] Web-based client (browser access)
- [ ] User accounts and authentication
- [ ] Connection history and logs

## License

MIT

## Credits

Built with:
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [WebRTC](https://webrtc.org/) - Peer-to-peer communication
- [RobotJS](http://robotjs.io/) - Native mouse/keyboard control
- [ws](https://github.com/websockets/ws) - WebSocket library

## Support

For issues, questions, or contributions, please open an issue on GitHub.
