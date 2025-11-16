import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import {
  MessageType,
  SignalingMessage,
  Device,
  RegisterHostMessage,
  RegisterClientMessage,
  ConnectRequestMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
} from '@remoted/shared';

interface Client {
  id: string;
  ws: WebSocket;
  type: 'host' | 'client';
  device?: Device;
}

class SignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private devices: Map<string, Device> = new Map();
  private server: https.Server | http.Server | null = null;

  constructor(port: number = 8080) {
    const useSSL = process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH;

    if (useSSL) {
      try {
        const sslOptions = {
          key: fs.readFileSync(process.env.SSL_KEY_PATH!),
          cert: fs.readFileSync(process.env.SSL_CERT_PATH!),
        };

        this.server = https.createServer(sslOptions);
        this.wss = new WebSocketServer({ server: this.server });
        this.server.listen(port, () => {
          console.log(`Secure signaling server (WSS) started on port ${port}`);
        });
      } catch (error) {
        console.error('Failed to start SSL server:', error);
        console.log('Falling back to non-SSL mode...');
        this.wss = new WebSocketServer({ port });
        console.log(`Signaling server started on port ${port} (non-SSL fallback)`);
      }
    } else {
      this.wss = new WebSocketServer({ port });
      console.log(`Signaling server started on port ${port} (non-SSL mode)`);
    }

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New connection established');

      ws.on('message', (data: Buffer) => {
        try {
          const message: SignalingMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  private handleMessage(ws: WebSocket, message: SignalingMessage): void {
    console.log('Received message:', message.type);

    switch (message.type) {
      case MessageType.REGISTER_HOST:
        this.handleRegisterHost(ws, message as RegisterHostMessage);
        break;

      case MessageType.REGISTER_CLIENT:
        this.handleRegisterClient(ws, message as RegisterClientMessage);
        break;

      case MessageType.GET_DEVICES:
        this.handleGetDevices(ws);
        break;

      case MessageType.CONNECT_REQUEST:
        this.handleConnectRequest(ws, message as ConnectRequestMessage);
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

      case MessageType.DISCONNECT:
        this.handleDisconnect(ws);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleRegisterHost(ws: WebSocket, message: RegisterHostMessage): void {
    const { deviceId, deviceName, platform } = message;

    const device: Device = {
      deviceId,
      deviceName,
      platform,
      online: true,
      lastSeen: Date.now(),
    };

    const client: Client = {
      id: deviceId,
      ws,
      type: 'host',
      device,
    };

    this.clients.set(deviceId, client);
    this.devices.set(deviceId, device);

    console.log(`Host registered: ${deviceName} (${deviceId})`);

    // Send success response
    this.send(ws, {
      type: MessageType.AUTH_SUCCESS,
      timestamp: Date.now(),
      id: deviceId,
    });

    // Notify all clients about the new device
    this.broadcastDeviceStatus(device, MessageType.DEVICE_ONLINE);
  }

  private handleRegisterClient(ws: WebSocket, message: RegisterClientMessage): void {
    const clientId = message.clientId || uuidv4();

    const client: Client = {
      id: clientId,
      ws,
      type: 'client',
    };

    this.clients.set(clientId, client);

    console.log(`Client registered: ${clientId}`);

    // Send success response
    this.send(ws, {
      type: MessageType.AUTH_SUCCESS,
      timestamp: Date.now(),
      id: clientId,
    });
  }

  private handleGetDevices(ws: WebSocket): void {
    const devices = Array.from(this.devices.values());

    this.send(ws, {
      type: MessageType.DEVICE_LIST,
      timestamp: Date.now(),
      devices,
    });
  }

  private handleConnectRequest(ws: WebSocket, message: ConnectRequestMessage): void {
    const { targetDeviceId, clientId } = message;
    const targetClient = this.clients.get(targetDeviceId);

    if (!targetClient || targetClient.type !== 'host') {
      this.sendError(ws, 'Target device not found or offline');
      return;
    }

    console.log(`Connection request from ${clientId} to ${targetDeviceId}`);

    // Forward the connection request to the host
    this.send(targetClient.ws, {
      type: MessageType.CONNECT_REQUEST,
      timestamp: Date.now(),
      targetDeviceId,
      clientId,
    });

    // Send acceptance to client (in a real app, host would approve/deny)
    this.send(ws, {
      type: MessageType.CONNECTION_ACCEPTED,
      timestamp: Date.now(),
      hostId: targetDeviceId,
    });
  }

  private handleOffer(message: OfferMessage): void {
    const targetClient = this.clients.get(message.to);

    if (targetClient) {
      console.log(`Forwarding offer from ${message.from} to ${message.to}`);
      this.send(targetClient.ws, message);
    } else {
      console.warn(`Target client ${message.to} not found for offer`);
    }
  }

  private handleAnswer(message: AnswerMessage): void {
    const targetClient = this.clients.get(message.to);

    if (targetClient) {
      console.log(`Forwarding answer from ${message.from} to ${message.to}`);
      this.send(targetClient.ws, message);
    } else {
      console.warn(`Target client ${message.to} not found for answer`);
    }
  }

  private handleIceCandidate(message: IceCandidateMessage): void {
    const targetClient = this.clients.get(message.to);

    if (targetClient) {
      console.log(`Forwarding ICE candidate from ${message.from} to ${message.to}`);
      this.send(targetClient.ws, message);
    } else {
      console.warn(`Target client ${message.to} not found for ICE candidate`);
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    // Find and remove the client
    for (const [id, client] of this.clients.entries()) {
      if (client.ws === ws) {
        console.log(`Client disconnected: ${id}`);

        if (client.type === 'host' && client.device) {
          client.device.online = false;
          client.device.lastSeen = Date.now();
          this.broadcastDeviceStatus(client.device, MessageType.DEVICE_OFFLINE);
          this.devices.delete(id);
        }

        this.clients.delete(id);
        break;
      }
    }
  }

  private broadcastDeviceStatus(device: Device, status: MessageType.DEVICE_ONLINE | MessageType.DEVICE_OFFLINE): void {
    const message = {
      type: status,
      timestamp: Date.now(),
      device,
    };

    // Send to all connected clients (not hosts)
    for (const client of this.clients.values()) {
      if (client.type === 'client') {
        this.send(client.ws, message);
      }
    }
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string, details?: string): void {
    this.send(ws, {
      type: MessageType.ERROR,
      timestamp: Date.now(),
      error,
      details,
    });
  }
}

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
new SignalingServer(PORT);
