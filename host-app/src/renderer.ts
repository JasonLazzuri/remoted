import { ipcRenderer } from 'electron';
import { ControlMessage, ControlMessageType } from '@remoted/shared';

class HostRenderer {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private remoteClientId: string | null = null;
  private screenSize: { width: number; height: number } = { width: 1920, height: 1080 };

  constructor() {
    this.setupIpcListeners();
    this.init();
  }

  private async init(): Promise<void> {
    // Get screen size for coordinate mapping
    this.screenSize = await ipcRenderer.invoke('get-screen-size');
    console.log('Screen size:', this.screenSize);
  }

  private setupIpcListeners(): void {
    ipcRenderer.on('auth-success', (event, data) => {
      console.log('Authenticated:', data);
      this.updateUI('online', `Device ID: ${data.deviceId}<br>Name: ${data.deviceName}`);
    });

    ipcRenderer.on('connection-request', async (event, data) => {
      console.log('Connection request from client:', data.clientId);
      this.remoteClientId = data.clientId;
      this.updateUI('connecting', 'Client connecting...');

      // Host creates the offer (with video tracks) instead of waiting for client's offer
      await this.setupPeerConnection();
      await this.createAndSendOffer();
    });

    ipcRenderer.on('offer', async (event, data) => {
      console.log('Received offer');
      this.remoteClientId = data.from;
      await this.handleOffer(data.offer);
    });

    ipcRenderer.on('answer', async (event, data) => {
      console.log('Received answer');
      await this.handleAnswer(data.answer);
    });

    ipcRenderer.on('ice-candidate', async (event, data) => {
      console.log('Received ICE candidate');
      await this.handleIceCandidate(data.candidate);
    });

    ipcRenderer.on('status-update', (event, data) => {
      this.updateStatus(data.status);
    });
  }

  private async setupPeerConnection(): Promise<void> {
    console.log('Setting up peer connection');

    // Get ICE servers (including TURN if configured)
    const iceServers = await ipcRenderer.invoke('get-ice-servers');
    console.log('ICE servers configuration:', iceServers);

    // Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Set up ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.remoteClientId) {
        console.log('Sending ICE candidate');
        ipcRenderer.send('send-ice-candidate', {
          candidate: event.candidate.toJSON(),
          to: this.remoteClientId,
        });
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        this.updateUI('connected', 'Client connected!');
      } else if (this.peerConnection?.connectionState === 'disconnected') {
        this.updateUI('online', 'Client disconnected');
      }
    };

    // Set up data channel for receiving control messages
    this.peerConnection.ondatachannel = (event) => {
      console.log('Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    // Get screen stream
    await this.captureScreen();

    // Add tracks to peer connection
    if (this.mediaStream) {
      console.log('Adding tracks to peer connection...');
      this.mediaStream.getTracks().forEach((track) => {
        if (this.peerConnection && this.mediaStream) {
          this.peerConnection.addTrack(track, this.mediaStream);
          console.log('✓ Added track:', track.kind, track.id);
        }
      });
    } else {
      console.error('❌ No media stream available! Screen capture may have failed.');
    }
  }

  private async captureScreen(): Promise<void> {
    try {
      console.log('Starting screen capture...');
      const sources = await ipcRenderer.invoke('get-sources');
      console.log(`Found ${sources.length} screen sources:`, sources.map((s: any) => ({ id: s.id, name: s.name })));

      if (sources.length === 0) {
        console.error('No screen sources found');
        return;
      }

      // Use the first screen (primary display)
      const primarySource = sources[0];
      console.log('Using screen source:', { id: primarySource.id, name: primarySource.name });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: primarySource.id,
          },
        } as any,
      });

      console.log('getUserMedia succeeded, stream:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().length
      });

      this.mediaStream = stream;
      const tracks = stream.getTracks();
      console.log('Screen captured successfully, tracks:', tracks.map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled, readyState: t.readyState })));
    } catch (error) {
      console.error('Error capturing screen:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message: ControlMessage = JSON.parse(event.data);
        this.handleControlMessage(message);
      } catch (error) {
        console.error('Error parsing control message:', error);
      }
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
    };
  }

  private handleControlMessage(message: ControlMessage): void {
    // Forward control message to main process where robotjs runs
    ipcRenderer.send('control-message', message);
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection) {
      console.error('Cannot create offer: peer connection not set up');
      return;
    }

    console.log('Creating offer with video track...');
    const offer = await this.peerConnection.createOffer();
    console.log('Offer SDP includes video:', offer.sdp?.includes('m=video'));

    await this.peerConnection.setLocalDescription(offer);
    console.log('Set local description (offer)');

    if (this.remoteClientId) {
      console.log('Sending offer to client:', this.remoteClientId);
      ipcRenderer.send('send-offer', {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        to: this.remoteClientId,
      });
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('Handling offer from client...');

    // Always set up peer connection first (includes screen capture)
    if (!this.peerConnection) {
      console.log('Peer connection not found, setting up...');
      await this.setupPeerConnection();
    } else {
      console.log('Peer connection already exists');
    }

    if (!this.peerConnection) {
      console.error('Failed to set up peer connection!');
      return;
    }

    console.log('Setting remote description (offer)...');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    console.log('Creating answer...');
    const answer = await this.peerConnection.createAnswer();
    console.log('Answer SDP includes video:', answer.sdp?.includes('m=video'));
    console.log('Answer created:', { type: answer.type, sdpLength: answer.sdp?.length });

    await this.peerConnection.setLocalDescription(answer);
    console.log('Set local description (answer)');

    if (this.remoteClientId) {
      console.log('Sending answer to client:', this.remoteClientId);
      ipcRenderer.send('send-answer', {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        to: this.remoteClientId,
      });
    } else {
      console.error('Cannot send answer: remoteClientId is null');
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private updateUI(status: string, message: string): void {
    const statusElement = document.getElementById('status');
    const infoElement = document.getElementById('info');

    if (statusElement) {
      statusElement.textContent = status.toUpperCase();
      statusElement.className = `status status-${status}`;
    }

    if (infoElement) {
      infoElement.innerHTML = message;
    }
  }

  private updateStatus(status: 'online' | 'offline' | 'connected'): void {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = status.toUpperCase();
      statusElement.className = `status status-${status}`;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HostRenderer();
});
