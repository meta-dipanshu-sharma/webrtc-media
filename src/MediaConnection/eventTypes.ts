export enum Event {
  CONNECTION_STATE_CHANGED = 'connectionState:changed', // connection state has changed, see ConnectionStateChangedEvent
  REMOTE_TRACK_ADDED = 'remoteTrack:added', // new remote track has been added, see RemoteTrackAddedEvent
  ROAP_MESSAGE_TO_SEND = 'roap:messageToSend', // a ROAP message needs to be sent to the backend, see RoapMessageEvent
}

// Overall connection state (based on the ICE and DTLS connection states)
export enum ConnectionState {
  NEW = 'NEW', // connection attempt has not been started
  CLOSED = 'CLOSED', // connection closed, there is no way to move out of this state
  CONNECTED = 'CONNECTED', // both ICE and DTLS connections are established, media is flowing
  CONNECTING = 'CONNECTING', // initial connection attempt in progress
  DISCONNECTED = 'DISCONNECTED', // connection lost temporarily, the browser is trying to re-establish it automatically
  FAILED = 'FAILED', // connection failed, a call to reconnect() is required to try again
}

export interface ConnectionStateChangedEvent {
  state: ConnectionState; // current connection state
}

export enum RemoteTrackType {
  AUDIO = 'audio',
  VIDEO = 'video',
  SCREENSHARE_VIDEO = 'screenShareVideo',
}

export interface RemoteTrackAddedEvent {
  type: RemoteTrackType;
  track: MediaStreamTrack;
}

// TODO: create separate type for each roap message type

/**
 * see https://tools.ietf.org/id/draft-jennings-rtcweb-signaling-01.html for details
 */
export interface RoapMessage {
  seq: number;
  messageType: 'OFFER' | 'ANSWER' | 'OK' | 'ERROR';
  offererSessionId?: string;
  answererSessionId?: string;
  sdp?: string;
  tieBreaker?: string;
  errorType?: string; // used only if messageType==='ERROR'
}

export interface RoapMessageEvent {
  roapMessage: RoapMessage; // roap message that needs to be sent to the backend as soon as possible
}
