import { ipcRenderer } from 'electron';
import { Device } from '@remoted/shared';
import { ControlMessage, ControlMessageType } from '@remoted/shared';

class ClientRenderer {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private remoteStream: MediaStream | null = null;
  private targetDeviceId: string | null = null;
  private devices: Device[] = [];
  private isControlEnabled: boolean = false;
  private videoElement: HTMLVideoElement | null = null;

  constructor() {
    this.setupIpcListeners();
    this.setupUI();
  }

  private setupIpcListeners(): void {
    ipcRenderer.on('auth-success', (event, data) => {
      console.log('Authenticated:', data);
      this.updateStatus('online');
    });

    ipcRenderer.on('device-list', (event, data) => {
      console.log('Received device list:', data.devices);
      this.devices = data.devices;
      this.renderDeviceList();
    });

    ipcRenderer.on('connection-accepted', (event, data) => {
      console.log('Connection accepted');
      this.updateStatus('connecting');
      this.setupPeerConnection();
    });

    ipcRenderer.on('offer', async (event, data) => {
      console.log('Received offer');
      await this.handleOffer(data.offer, data.from);
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

    ipcRenderer.on('error', (event, data) => {
      console.error('Error:', data.error);
      alert(`Error: ${data.error.error}`);
    });
  }

  private setupUI(): void {
    // Device list refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        ipcRenderer.send('refresh-devices');
      });
    }

    // Video element for remote stream
    this.videoElement = document.getElementById('remote-video') as HTMLVideoElement;

    // Disconnect button
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        this.disconnect();
      });
    }

    // Enable control button
    const enableControlBtn = document.getElementById('enable-control-btn');
    if (enableControlBtn) {
      enableControlBtn.addEventListener('click', () => {
        this.toggleControl();
      });
    }
  }

  private renderDeviceList(): void {
    const deviceListElement = document.getElementById('device-list');
    if (!deviceListElement) return;

    if (this.devices.length === 0) {
      deviceListElement.innerHTML = '<div class="no-devices">No devices available</div>';
      return;
    }

    deviceListElement.innerHTML = '';

    this.devices.forEach((device) => {
      const deviceCard = document.createElement('div');
      deviceCard.className = 'device-card';

      const statusClass = device.online ? 'online' : 'offline';

      deviceCard.innerHTML = `
        <div class="device-info">
          <div class="device-icon">${this.getDeviceIcon(device.platform)}</div>
          <div class="device-details">
            <div class="device-name">${device.deviceName}</div>
            <div class="device-platform">${device.platform}</div>
          </div>
        </div>
        <div class="device-status ${statusClass}">${device.online ? 'Online' : 'Offline'}</div>
        ${device.online ? '<button class="connect-btn">Connect</button>' : ''}
      `;

      if (device.online) {
        const connectBtn = deviceCard.querySelector('.connect-btn');
        if (connectBtn) {
          connectBtn.addEventListener('click', () => {
            this.connectToDevice(device.deviceId);
          });
        }
      }

      deviceListElement.appendChild(deviceCard);
    });
  }

  private getDeviceIcon(platform: string): string {
    const icons: { [key: string]: string } = {
      darwin: '🍎',
      win32: '🪟',
      linux: '🐧',
    };
    return icons[platform] || '💻';
  }

  private connectToDevice(deviceId: string): void {
    console.log('Connecting to device:', deviceId);
    this.targetDeviceId = deviceId;
    ipcRenderer.send('connect-to-device', deviceId);
  }

  private async setupPeerConnection(): Promise<void> {
    console.log('Setting up peer connection');

    // Get ICE servers (including TURN if configured)
    const iceServers = await ipcRenderer.invoke('get-ice-servers');
    console.log('ICE servers configuration:', iceServers);

    this.peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Set up ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetDeviceId) {
        console.log('Sending ICE candidate');
        ipcRenderer.send('send-ice-candidate', {
          candidate: event.candidate.toJSON(),
          to: this.targetDeviceId,
        });
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        this.updateStatus('connected');
        this.showRemoteView();
      } else if (this.peerConnection?.connectionState === 'disconnected') {
        this.updateStatus('online');
        this.showDeviceList();
      }
    };

    // Handle incoming video stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', {
        kind: event.track.kind,
        id: event.track.id,
        enabled: event.track.enabled,
        readyState: event.track.readyState,
        muted: event.track.muted,
        streams: event.streams?.length
      });
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        console.log('Setting video stream:', {
          streamId: this.remoteStream.id,
          tracks: this.remoteStream.getTracks().map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled, readyState: t.readyState }))
        });
        if (this.videoElement) {
          this.videoElement.srcObject = this.remoteStream;
          console.log('Video element updated with stream');
          // Add event listener to check when video starts playing
          this.videoElement.onloadedmetadata = () => {
            console.log('Video metadata loaded:', {
              videoWidth: this.videoElement?.videoWidth,
              videoHeight: this.videoElement?.videoHeight
            });
            // Explicitly start playback
            this.videoElement?.play().then(() => {
              console.log('Video playback started successfully');
            }).catch(err => {
              console.error('Error starting video playback:', err);
            });
          };
          this.videoElement.onplay = () => {
            console.log('Video playing event fired');
          };
          this.videoElement.onerror = (e) => {
            console.error('Video element error:', e);
          };
        } else {
          console.error('Video element not found!');
        }
      } else {
        console.log('No streams in track event');
      }
    };

    // Create data channel for control messages
    this.dataChannel = this.peerConnection.createDataChannel('control');
    this.setupDataChannel();

    // Don't create offer - wait for offer from host (which includes video tracks)
    console.log('Waiting for offer from host...');
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.isControlEnabled = false; // Disabled by default for security
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.isControlEnabled = false;
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
    };
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, from: string): Promise<void> {
    console.log('Received offer from host:', from);
    console.log('Offer includes video:', offer.sdp?.includes('m=video'));
    this.targetDeviceId = from;

    if (!this.peerConnection) {
      await this.setupPeerConnection();
    }

    if (!this.peerConnection) return;

    console.log('Setting remote description (offer from host)');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    console.log('Creating answer...');
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    console.log('Sending answer to host');
    ipcRenderer.send('send-answer', {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      },
      to: from,
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private showDeviceList(): void {
    const deviceListView = document.getElementById('device-list-view');
    const remoteView = document.getElementById('remote-view');

    if (deviceListView) deviceListView.style.display = 'block';
    if (remoteView) remoteView.style.display = 'none';
  }

  private showRemoteView(): void {
    const deviceListView = document.getElementById('device-list-view');
    const remoteView = document.getElementById('remote-view');

    if (deviceListView) deviceListView.style.display = 'none';
    if (remoteView) remoteView.style.display = 'flex';

    // Set up remote control listeners
    this.setupRemoteControlListeners();
  }

  private setupRemoteControlListeners(): void {
    if (!this.videoElement) return;

    // Mouse move
    this.videoElement.addEventListener('mousemove', (e) => {
      if (!this.isControlEnabled) return;
      const coords = this.getRemoteCoordinates(e);
      this.sendControlMessage({
        type: ControlMessageType.MOUSE_MOVE,
        x: coords.x,
        y: coords.y,
      });
    });

    // Mouse down
    this.videoElement.addEventListener('mousedown', (e) => {
      if (!this.isControlEnabled) return;
      e.preventDefault();
      const coords = this.getRemoteCoordinates(e);
      this.sendControlMessage({
        type: ControlMessageType.MOUSE_DOWN,
        button: this.getButtonName(e.button),
        x: coords.x,
        y: coords.y,
      });
    });

    // Mouse up
    this.videoElement.addEventListener('mouseup', (e) => {
      if (!this.isControlEnabled) return;
      e.preventDefault();
      const coords = this.getRemoteCoordinates(e);
      this.sendControlMessage({
        type: ControlMessageType.MOUSE_UP,
        button: this.getButtonName(e.button),
        x: coords.x,
        y: coords.y,
      });
    });

    // Prevent context menu
    this.videoElement.addEventListener('contextmenu', (e) => {
      if (this.isControlEnabled) {
        e.preventDefault();
      }
    });

    // Keyboard events (only when video is focused)
    this.videoElement.tabIndex = 0; // Make it focusable

    this.videoElement.addEventListener('keydown', (e) => {
      if (!this.isControlEnabled) return;
      e.preventDefault();
      this.sendControlMessage({
        type: ControlMessageType.KEY_DOWN,
        key: e.key,
        code: e.code,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        },
      });
    });

    this.videoElement.addEventListener('keyup', (e) => {
      if (!this.isControlEnabled) return;
      e.preventDefault();
      this.sendControlMessage({
        type: ControlMessageType.KEY_UP,
        key: e.key,
        code: e.code,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        },
      });
    });

    // Mouse wheel
    this.videoElement.addEventListener('wheel', (e) => {
      if (!this.isControlEnabled) return;
      e.preventDefault();
      this.sendControlMessage({
        type: ControlMessageType.MOUSE_WHEEL,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    });
  }

  private getRemoteCoordinates(e: MouseEvent): { x: number; y: number } {
    if (!this.videoElement) return { x: 0, y: 0 };

    const rect = this.videoElement.getBoundingClientRect();
    const scaleX = this.videoElement.videoWidth / rect.width;
    const scaleY = this.videoElement.videoHeight / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    return { x, y };
  }

  private getButtonName(button: number): 'left' | 'right' | 'middle' {
    switch (button) {
      case 0:
        return 'left';
      case 1:
        return 'middle';
      case 2:
        return 'right';
      default:
        return 'left';
    }
  }

  private sendControlMessage(message: ControlMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return;
    }

    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending control message:', error);
    }
  }

  private toggleControl(): void {
    this.isControlEnabled = !this.isControlEnabled;

    const enableControlBtn = document.getElementById('enable-control-btn');
    if (enableControlBtn) {
      enableControlBtn.textContent = this.isControlEnabled ? 'Disable Control' : 'Enable Control';
      enableControlBtn.classList.toggle('active', this.isControlEnabled);
    }

    if (this.isControlEnabled && this.videoElement) {
      this.videoElement.focus();
    }

    console.log('Control enabled:', this.isControlEnabled);
  }

  private disconnect(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    this.isControlEnabled = false;
    this.targetDeviceId = null;
    this.remoteStream = null;

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.showDeviceList();
    this.updateStatus('online');
  }

  private updateStatus(status: string): void {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = status.toUpperCase();
      statusElement.className = `status status-${status}`;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ClientRenderer();
});
