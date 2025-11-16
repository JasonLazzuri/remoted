import 'dotenv/config';
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, systemPreferences } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import robot from 'robotjs';
import {
  MessageType,
  SignalingMessage,
  RegisterHostMessage,
  ConnectRequestMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  ControlMessage,
  ControlMessageType,
} from '@remoted/shared';

const SIGNALING_SERVER = process.env.SIGNALING_SERVER || 'ws://localhost:8080';

class HostApp {
  private mainWindow: BrowserWindow | null = null;
  private ws: WebSocket | null = null;
  private deviceId: string;
  private deviceName: string;
  private connectedClientId: string | null = null;

  constructor() {
    // Load or generate device ID
    this.deviceId = this.getDeviceId();
    this.deviceName = os.hostname() || 'Unknown Device';

    app.whenReady().then(() => {
      this.checkScreenCapturePermissions();
      this.createWindow();
      this.connectToSignalingServer();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // Handle IPC from renderer process
    this.setupIpcHandlers();
  }

  private checkScreenCapturePermissions(): void {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log('Screen capture permission status:', status);

      if (status !== 'granted') {
        console.warn('⚠️  Screen capture permission not granted!');
        console.warn('Please grant screen recording permission in System Settings > Privacy & Security > Screen Recording');
      } else {
        console.log('✓ Screen capture permission granted');
      }
    }
  }

  private getDeviceId(): string {
    // Check if device ID exists in electron store/config
    const fs = require('fs');
    const pathModule = require('path');

    const userDataPath = app.getPath('userData');
    const configPath = pathModule.join(userDataPath, 'device-config.json');

    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.deviceId) {
          console.log('Using existing device ID:', config.deviceId);
          return config.deviceId;
        }
      }
    } catch (error) {
      console.error('Error reading device config:', error);
    }

    // Generate new device ID
    const newDeviceId = uuidv4();
    console.log('Generated new device ID:', newDeviceId);

    try {
      fs.writeFileSync(configPath, JSON.stringify({ deviceId: newDeviceId }, null, 2));
    } catch (error) {
      console.error('Error saving device config:', error);
    }

    return newDeviceId;
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      title: 'Remoted Host',
    });

    this.mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

    // Open DevTools in development
    this.mainWindow.webContents.openDevTools();

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private connectToSignalingServer(): void {
    console.log(`Connecting to signaling server: ${SIGNALING_SERVER}`);

    this.ws = new WebSocket(SIGNALING_SERVER);

    this.ws.on('open', () => {
      console.log('Connected to signaling server');
      this.registerHost();
      this.updateStatus('online');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message: SignalingMessage = JSON.parse(data.toString());
        this.handleSignalingMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from signaling server');
      this.updateStatus('offline');

      // Reconnect after 5 seconds
      setTimeout(() => {
        this.connectToSignalingServer();
      }, 5000);
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private registerHost(): void {
    if (!this.ws) return;

    const message: RegisterHostMessage = {
      type: MessageType.REGISTER_HOST,
      timestamp: Date.now(),
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      platform: process.platform,
    };

    this.send(message);
    console.log('Registered as host:', this.deviceName);
  }

  private handleSignalingMessage(message: SignalingMessage): void {
    console.log('Received signaling message:', message.type);

    switch (message.type) {
      case MessageType.AUTH_SUCCESS:
        console.log('Authentication successful');
        this.sendToRenderer('auth-success', { deviceId: this.deviceId, deviceName: this.deviceName });
        break;

      case MessageType.CONNECT_REQUEST:
        this.handleConnectionRequest(message as ConnectRequestMessage);
        break;

      case MessageType.OFFER:
        this.handleOffer(message as OfferMessage);
        break;

      case MessageType.ANSWER:
        this.handleAnswer(message as AnswerMessage);
        break;

      case MessageType.ICE_CANDIDATE:
        this.handleIceCandidate(message as IceCandidateMessage);
        break;

      case MessageType.ERROR:
        console.error('Server error:', message);
        break;
    }
  }

  private handleConnectionRequest(message: ConnectRequestMessage): void {
    console.log(`Connection request from client: ${message.clientId}`);
    this.connectedClientId = message.clientId;
    this.sendToRenderer('connection-request', { clientId: message.clientId });
  }

  private handleOffer(message: OfferMessage): void {
    console.log(`Received offer from: ${message.from}`);
    this.sendToRenderer('offer', { offer: message.offer, from: message.from });
  }

  private handleAnswer(message: AnswerMessage): void {
    console.log(`Received answer from: ${message.from}`);
    this.sendToRenderer('answer', { answer: message.answer, from: message.from });
  }

  private handleIceCandidate(message: IceCandidateMessage): void {
    console.log(`Received ICE candidate from: ${message.from}`);
    this.sendToRenderer('ice-candidate', { candidate: message.candidate, from: message.from });
  }

  private setupIpcHandlers(): void {
    // Send signaling messages from renderer to server
    ipcMain.on('send-offer', (event, { offer, to }) => {
      const message: OfferMessage = {
        type: MessageType.OFFER,
        timestamp: Date.now(),
        offer,
        from: this.deviceId,
        to,
      };
      this.send(message);
    });

    ipcMain.on('send-answer', (event, { answer, to }) => {
      const message: AnswerMessage = {
        type: MessageType.ANSWER,
        timestamp: Date.now(),
        answer,
        from: this.deviceId,
        to,
      };
      this.send(message);
    });

    ipcMain.on('send-ice-candidate', (event, { candidate, to }) => {
      const message: IceCandidateMessage = {
        type: MessageType.ICE_CANDIDATE,
        timestamp: Date.now(),
        candidate,
        from: this.deviceId,
        to,
      };
      this.send(message);
    });

    // Get screen sources for sharing
    ipcMain.handle('get-sources', async () => {
      console.log('Requesting screen sources...');
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 150, height: 150 },
        });
        console.log(`Found ${sources.length} screen sources:`, sources.map(s => ({ id: s.id, name: s.name })));
        return sources;
      } catch (error) {
        console.error('Error getting screen sources:', error);
        throw error;
      }
    });

    // Get screen size
    ipcMain.handle('get-screen-size', () => {
      const primaryDisplay = screen.getPrimaryDisplay();
      return primaryDisplay.size;
    });

    // Handle control messages from renderer
    ipcMain.on('control-message', (event, message: ControlMessage) => {
      this.handleControlMessage(message);
    });
  }

  private handleControlMessage(message: ControlMessage): void {
    try {
      switch (message.type) {
        case ControlMessageType.MOUSE_MOVE:
          // Disabled to prevent feedback loop when testing on same machine
          // robot.moveMouse(message.x, message.y);
          console.log('Mouse move (disabled for testing):', message.x, message.y);
          break;

        case ControlMessageType.MOUSE_DOWN:
          // Disabled to prevent feedback loop when testing on same machine
          // robot.mouseToggle('down', this.mapButton(message.button));
          console.log('Mouse down (disabled for testing):', message.button);
          break;

        case ControlMessageType.MOUSE_UP:
          // Disabled to prevent feedback loop when testing on same machine
          // robot.mouseToggle('up', this.mapButton(message.button));
          console.log('Mouse up (disabled for testing):', message.button);
          break;

        case ControlMessageType.MOUSE_WHEEL:
          // RobotJS doesn't have built-in scroll, would need platform-specific implementation
          console.log('Mouse wheel:', message.deltaY);
          break;

        case ControlMessageType.KEY_DOWN:
          this.handleKeyPress(message.key, message.code, message.modifiers, true);
          break;

        case ControlMessageType.KEY_UP:
          this.handleKeyPress(message.key, message.code, message.modifiers, false);
          break;

        case ControlMessageType.CLIPBOARD_SYNC:
          // Clipboard sync would be implemented here
          console.log('Clipboard sync:', message.content);
          break;
      }
    } catch (error) {
      console.error('Error handling control message:', error);
    }
  }

  private mapButton(button: 'left' | 'right' | 'middle'): string {
    const mapping: { [key: string]: string } = {
      left: 'left',
      right: 'right',
      middle: 'middle',
    };
    return mapping[button] || 'left';
  }

  private handleKeyPress(key: string, code: string, modifiers: any, isDown: boolean): void {
    try {
      // Map modifier keys
      const modKeys: string[] = [];
      if (modifiers.ctrl) modKeys.push('control');
      if (modifiers.shift) modKeys.push('shift');
      if (modifiers.alt) modKeys.push('alt');
      if (modifiers.meta) modKeys.push('command');

      // Press/release modifiers
      modKeys.forEach(mod => {
        if (isDown) {
          robot.keyToggle(mod, 'down');
        }
      });

      // Press/release the main key
      const mappedKey = this.mapKey(key, code);
      if (mappedKey) {
        robot.keyToggle(mappedKey, isDown ? 'down' : 'up');
      }

      // Release modifiers
      if (!isDown) {
        modKeys.forEach(mod => {
          robot.keyToggle(mod, 'up');
        });
      }
    } catch (error) {
      console.error('Error handling key press:', error);
    }
  }

  private mapKey(key: string, code: string): string | null {
    // Simple key mapping - expand as needed
    const keyMap: { [key: string]: string } = {
      'Enter': 'enter',
      'Backspace': 'backspace',
      'Tab': 'tab',
      'Escape': 'escape',
      'Delete': 'delete',
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      ' ': 'space',
    };

    if (keyMap[key]) {
      return keyMap[key];
    }

    // For regular characters, use the key directly
    if (key.length === 1) {
      return key.toLowerCase();
    }

    return null;
  }

  private send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  private updateStatus(status: 'online' | 'offline' | 'connected'): void {
    this.sendToRenderer('status-update', { status });
  }
}

// Start the app
new HostApp();
