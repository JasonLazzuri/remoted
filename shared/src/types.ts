// Message types for WebSocket communication between clients and signaling server
export enum MessageType {
  // Authentication & Registration
  REGISTER_HOST = 'register_host',
  REGISTER_CLIENT = 'register_client',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',

  // Device Management
  GET_DEVICES = 'get_devices',
  DEVICE_LIST = 'device_list',
  DEVICE_ONLINE = 'device_online',
  DEVICE_OFFLINE = 'device_offline',

  // Connection Signaling (WebRTC)
  CONNECT_REQUEST = 'connect_request',
  OFFER = 'offer',
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice_candidate',

  // Connection Status
  CONNECTION_ACCEPTED = 'connection_accepted',
  CONNECTION_REJECTED = 'connection_rejected',
  DISCONNECT = 'disconnect',

  // Errors
  ERROR = 'error',
}

// Base message structure
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

// Authentication messages
export interface RegisterHostMessage extends BaseMessage {
  type: MessageType.REGISTER_HOST;
  deviceId: string;
  deviceName: string;
  platform: string;
}

export interface RegisterClientMessage extends BaseMessage {
  type: MessageType.REGISTER_CLIENT;
  clientId: string;
}

export interface AuthSuccessMessage extends BaseMessage {
  type: MessageType.AUTH_SUCCESS;
  id: string;
}

// Device management
export interface Device {
  deviceId: string;
  deviceName: string;
  platform: string;
  online: boolean;
  lastSeen: number;
}

export interface DeviceListMessage extends BaseMessage {
  type: MessageType.DEVICE_LIST;
  devices: Device[];
}

export interface GetDevicesMessage extends BaseMessage {
  type: MessageType.GET_DEVICES;
}

export interface DeviceStatusMessage extends BaseMessage {
  type: MessageType.DEVICE_ONLINE | MessageType.DEVICE_OFFLINE;
  device: Device;
}

// WebRTC Signaling
export interface ConnectRequestMessage extends BaseMessage {
  type: MessageType.CONNECT_REQUEST;
  targetDeviceId: string;
  clientId: string;
}

export interface OfferMessage extends BaseMessage {
  type: MessageType.OFFER;
  offer: RTCSessionDescriptionInit;
  from: string;
  to: string;
}

export interface AnswerMessage extends BaseMessage {
  type: MessageType.ANSWER;
  answer: RTCSessionDescriptionInit;
  from: string;
  to: string;
}

export interface IceCandidateMessage extends BaseMessage {
  type: MessageType.ICE_CANDIDATE;
  candidate: RTCIceCandidateInit;
  from: string;
  to: string;
}

// Connection status
export interface ConnectionAcceptedMessage extends BaseMessage {
  type: MessageType.CONNECTION_ACCEPTED;
  hostId: string;
}

export interface DisconnectMessage extends BaseMessage {
  type: MessageType.DISCONNECT;
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: string;
}

// Union type of all messages
export type SignalingMessage =
  | RegisterHostMessage
  | RegisterClientMessage
  | AuthSuccessMessage
  | GetDevicesMessage
  | DeviceListMessage
  | DeviceStatusMessage
  | ConnectRequestMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | ConnectionAcceptedMessage
  | DisconnectMessage
  | ErrorMessage;

// Remote control message types (sent over WebRTC data channel)
export enum ControlMessageType {
  MOUSE_MOVE = 'mouse_move',
  MOUSE_DOWN = 'mouse_down',
  MOUSE_UP = 'mouse_up',
  MOUSE_WHEEL = 'mouse_wheel',
  KEY_DOWN = 'key_down',
  KEY_UP = 'key_up',
  CLIPBOARD_SYNC = 'clipboard_sync',
}

export interface MouseMoveMessage {
  type: ControlMessageType.MOUSE_MOVE;
  x: number;
  y: number;
}

export interface MouseButtonMessage {
  type: ControlMessageType.MOUSE_DOWN | ControlMessageType.MOUSE_UP;
  button: 'left' | 'right' | 'middle';
  x: number;
  y: number;
}

export interface MouseWheelMessage {
  type: ControlMessageType.MOUSE_WHEEL;
  deltaX: number;
  deltaY: number;
}

export interface KeyMessage {
  type: ControlMessageType.KEY_DOWN | ControlMessageType.KEY_UP;
  key: string;
  code: string;
  modifiers: {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
  };
}

export interface ClipboardMessage {
  type: ControlMessageType.CLIPBOARD_SYNC;
  content: string;
}

export type ControlMessage =
  | MouseMoveMessage
  | MouseButtonMessage
  | MouseWheelMessage
  | KeyMessage
  | ClipboardMessage;
