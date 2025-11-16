import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import {
  MessageType,
  SignalingMessage,
  RegisterClientMessage,
  ConnectRequestMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  DeviceListMessage,
} from '@remoted/shared';

const SIGNALING_SERVER = process.env.SIGNALING_SERVER || 'ws://localhost:8080';
const TURN_SERVER_URL = process.env.TURN_SERVER_URL || '';
const TURN_SERVER_USERNAME = process.env.TURN_SERVER_USERNAME || '';
const TURN_SERVER_CREDENTIAL = process.env.TURN_SERVER_CREDENTIAL || '';

class ClientApp {
  private mainWindow: BrowserWindow | null = null;
  private ws: WebSocket | null = null;
  private clientId: string;

  constructor() {
    this.clientId = uuidv4();

    app.whenReady().then(() => {
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

    this.setupIpcHandlers();
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      title: 'Remoted Client',
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
      this.registerClient();
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

  private registerClient(): void {
    if (!this.ws) return;

    const message: RegisterClientMessage = {
      type: MessageType.REGISTER_CLIENT,
      timestamp: Date.now(),
      clientId: this.clientId,
    };

    this.send(message);
    console.log('Registered as client:', this.clientId);

    // Request device list
    this.requestDeviceList();
  }

  private requestDeviceList(): void {
    if (!this.ws) return;

    this.send({
      type: MessageType.GET_DEVICES,
      timestamp: Date.now(),
    });
  }

  private handleSignalingMessage(message: SignalingMessage): void {
    console.log('Received signaling message:', message.type);

    switch (message.type) {
      case MessageType.AUTH_SUCCESS:
        console.log('Authentication successful');
        this.sendToRenderer('auth-success', { clientId: this.clientId });
        break;

      case MessageType.DEVICE_LIST:
        this.handleDeviceList(message as DeviceListMessage);
        break;

      case MessageType.DEVICE_ONLINE:
      case MessageType.DEVICE_OFFLINE:
        this.requestDeviceList(); // Refresh device list
        break;

      case MessageType.CONNECTION_ACCEPTED:
        this.sendToRenderer('connection-accepted', {});
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
        this.sendToRenderer('error', { error: message });
        break;
    }
  }

  private handleDeviceList(message: DeviceListMessage): void {
    console.log('Received device list:', message.devices);
    this.sendToRenderer('device-list', { devices: message.devices });
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
    // Connect to a device
    ipcMain.on('connect-to-device', (event, deviceId) => {
      console.log('Connecting to device:', deviceId);
      const message: ConnectRequestMessage = {
        type: MessageType.CONNECT_REQUEST,
        timestamp: Date.now(),
        targetDeviceId: deviceId,
        clientId: this.clientId,
      };
      this.send(message);
    });

    // Send signaling messages
    ipcMain.on('send-offer', (event, { offer, to }) => {
      const message: OfferMessage = {
        type: MessageType.OFFER,
        timestamp: Date.now(),
        offer,
        from: this.clientId,
        to,
      };
      this.send(message);
    });

    ipcMain.on('send-answer', (event, { answer, to }) => {
      const message: AnswerMessage = {
        type: MessageType.ANSWER,
        timestamp: Date.now(),
        answer,
        from: this.clientId,
        to,
      };
      this.send(message);
    });

    ipcMain.on('send-ice-candidate', (event, { candidate, to }) => {
      const message: IceCandidateMessage = {
        type: MessageType.ICE_CANDIDATE,
        timestamp: Date.now(),
        candidate,
        from: this.clientId,
        to,
      };
      this.send(message);
    });

    // Refresh device list
    ipcMain.on('refresh-devices', () => {
      this.requestDeviceList();
    });

    // Get ICE server configuration (STUN + TURN)
    ipcMain.handle('get-ice-servers', () => {
      const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      // Add TURN server if configured
      if (TURN_SERVER_URL && TURN_SERVER_USERNAME && TURN_SERVER_CREDENTIAL) {
        iceServers.push({
          urls: TURN_SERVER_URL,
          username: TURN_SERVER_USERNAME,
          credential: TURN_SERVER_CREDENTIAL,
        });
        console.log('TURN server configured:', TURN_SERVER_URL);
      } else {
        console.log('No TURN server configured (using STUN only)');
      }

      return iceServers;
    });
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  private updateStatus(status: 'online' | 'offline'): void {
    this.sendToRenderer('status-update', { status });
  }
}

// Start the app
new ClientApp();
