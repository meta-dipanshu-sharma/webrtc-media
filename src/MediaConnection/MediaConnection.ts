import EventEmitter from 'events';

import {log, error} from './logger';
import {Roap} from './roap';
import {getLocalTrackInfo, TrackKind} from './utils';
import {
  Event,
  ConnectionState,
  RemoteTrackType,
  RoapMessage,
  RoapMessageEvent,
} from './eventTypes';

import {MediaConnectionConfig} from './config';

interface LocalTracks {
  audio?: MediaStreamTrack | null;
  video?: MediaStreamTrack | null;
  screenShareVideo?: MediaStreamTrack | null;
}

interface Transceivers {
  audio?: RTCRtpTransceiver;
  video?: RTCRtpTransceiver;
  screenShareVideo?: RTCRtpTransceiver;
}

const localTrackTypes = [
  {type: 'audio', kind: 'audio'},
  {type: 'video', kind: 'video'},
  {type: 'screenShareVideo', kind: 'video'},
];

// eslint-disable-next-line import/prefer-default-export
export class MediaConnection extends EventEmitter {
  private id?: string; // used just for logging

  private config: MediaConnectionConfig;

  private pc: RTCPeerConnection;

  private roap: Roap;

  private localTracks: LocalTracks;

  private transceivers: Transceivers;

  private receiveOptions: {
    audio: boolean;
    video: boolean;
    screenShareVideo: boolean;
  };

  private localOfferInitiated = false;

  private mediaConnectionState: ConnectionState;

  /**
   * Class that provides a simple high level API for creating
   * and managing a media connection (using webrtc RTCPeerConnection).
   *
   * @param MediaConnectionConfig - configuration for the media connection
   * @param send - local tracks that are going to be sent our
   * @param receive - options choosing which remote tracks will be received
   * @param debugId - optional string to identify the media connection in the logs
   */
  constructor(
    mediaConnectionConfig: MediaConnectionConfig,
    options: {
      send: {
        audio?: MediaStreamTrack;
        video?: MediaStreamTrack;
        screenShareVideo?: MediaStreamTrack;
      };
      receive: {
        audio: boolean;
        video: boolean;
        screenShareVideo: boolean;
      };
    },
    debugId?: string,
  ) {
    super();

    this.config = mediaConnectionConfig;
    this.receiveOptions = options.receive;
    this.localTracks = options.send;
    this.id = debugId || 'MediaConnection';
    this.transceivers = {};
    this.mediaConnectionState = ConnectionState.NEW;

    // TODO: existing SDK sets bundlePolicy: 'max-compat' for Firefox so we should probably do the same here
    this.pc = new window.RTCPeerConnection({iceServers: this.config.iceServers});

    this.roap = new Roap(this.pc, this.config, debugId);
    this.roap.on(Event.ROAP_MESSAGE_TO_SEND, this.onRoapMessageToSend.bind(this));

    this.pc.ontrack = this.onTrack.bind(this);
    this.pc.oniceconnectionstatechange = this.onIceConnectionStateChange.bind(this);
    this.pc.onconnectionstatechange = this.onConnectionStateChange.bind(this);

    log(
      `[${this.id}] MediaConnection created with config: ${JSON.stringify(
        mediaConnectionConfig,
      )}, options: ${options}`,
    );
  }

  private createTransceivers() {
    localTrackTypes.forEach(({type, kind}) => {
      const trackType = type as keyof LocalTracks;
      const transceiverType = type as keyof Transceivers;

      const trackInfo = getLocalTrackInfo(
        kind as TrackKind,
        this.receiveOptions[trackType],
        this.localTracks[trackType],
      );

      this.transceivers[transceiverType] = this.pc.addTransceiver(trackInfo.trackOrKind, {
        direction: trackInfo.direction,
      });
    });
  }

  /**
   * Starts the process of establishing the connection by creating a local SDP offer.
   *
   * Use Event.CONNECTION_STATE_CHANGED to know when connection has been established.
   * Use Event.ROAP_MESSAGE_TO_SEND to know the local SDP offer created.
   * Use Event.REMOTE_TRACK_ADDED to know about the remote tracks being received.
   *
   * @returns Promise - promise that's resolved once the local offer has been created
   */
  public initiateOffer(): Promise<void> {
    log(`[${this.id}] initiateOffer() called`);

    if (this.localOfferInitiated || this.pc.getTransceivers().length > 0) {
      error(`[${this.id}] SDP negotiation already started`);

      return Promise.reject(new Error('SDP negotiation already started'));
    }

    this.createTransceivers();
    this.localOfferInitiated = true;

    return this.roap.initiateOffer();
  }

  /**
   * Destroys the media connection.
   */
  // eslint-disable-next-line class-methods-use-this
  public close(): void {
    log(`[${this.id}] close() called`);

    this.pc.close();
    // todo
  }

  /**
   * Restarts the ICE connection.
   */
  // eslint-disable-next-line class-methods-use-this
  public reconnect(): void {
    log(`[${this.id}] reconnect() called`); // todo
  }

  /**
   * Updates the local tracks to be sent by the RTCPeerConnection.
   *
   *
   * @param tracks - specifies which local tracks to update:
   *                 each track (audio, video, screenShareVideo) can have one of these values:
   *                 - undefined - means "no change"
   *                 - null - means "stop using the current track"
   *                 - a MediaStreamTrack reference - means "replace the current track with this new one"
   *
   * @returns Promise - promise that's resolved once the new SDP exchange is initiated
   *                    or immediately if no new SDP exchange is needed
   */
  public updateSendOptions(tracks: LocalTracks): Promise<void> {
    log(`[${this.id}] updateSendOptions() called with ${JSON.stringify(tracks)}`);

    let newOfferNeeded = false;

    this.identifyTransceivers(); // this is needed here only for the case of updateSendOptions() being called on incoming call after the initial offer came with no remote tracks at all

    localTrackTypes.forEach(({type, kind}) => {
      const trackType = type as keyof LocalTracks;
      const transceiverType = type as keyof Transceivers;

      const track = tracks[trackType];
      const transceiver = this.transceivers[transceiverType];

      if (track !== undefined) {
        this.localTracks[trackType] = track;

        if (transceiver) {
          const trackInfo = getLocalTrackInfo(
            kind as TrackKind,
            this.receiveOptions[trackType],
            track,
          );

          transceiver.direction = trackInfo.direction;
          transceiver.sender.replaceTrack(track);
          newOfferNeeded = true; // todo: we probably don't need a new offer if only track was changed and not direction
        }
      }
    });

    if (newOfferNeeded) {
      log(`[${this.id}] updateLocalTracks() triggering offer...`);

      return this.roap.initiateOffer();
    }

    return Promise.resolve();
  }

  /**
   * Updates the choice of which tracks we want to receive
   *
   * @param options - specifies which remote tracks to receieve (audio, video, screenShareVideo)
   *
   * @returns Promise - promise that's resolved once the new SDP exchange is initiated
   *                    or immediately if no new SDP exchange is needed
   */
  public updateReceiveOptions(options: {
    audio: boolean;
    video: boolean;
    screenShareVideo: boolean;
  }): Promise<void> {
    log(`[${this.id}] updateReceiveOptions() called with ${JSON.stringify(options)}`);

    this.receiveOptions = options;

    this.identifyTransceivers(); // this is needed here only for the case of updateReceiveOptions() being called on incoming call after the initial offer came with no remote tracks at all

    let newOfferNeeded = false;

    localTrackTypes.forEach(({type, kind}) => {
      const trackType = type as keyof LocalTracks;
      const transceiverType = type as keyof Transceivers;

      const transceiver = this.transceivers[transceiverType];

      if (transceiver) {
        const trackInfo = getLocalTrackInfo(
          kind as TrackKind,
          this.receiveOptions[trackType],
          this.localTracks[trackType],
        );

        if (transceiver.direction !== trackInfo.direction) {
          transceiver.direction = trackInfo.direction;
          newOfferNeeded = true;
        }
      }
    });

    if (newOfferNeeded) {
      log(`[${this.id}] updateReceiveOptions() triggering offer...`);

      return this.roap.initiateOffer();
    }

    return Promise.resolve();
  }

  /**
   * @public Returns information about current connection state
   *
   * @returns ConnectionState
   */
  public getConnectionState(): ConnectionState {
    log(`[${this.id}] getConnectionState() called, returning ${this.mediaConnectionState}`);

    return this.mediaConnectionState;
  }

  /**
   * This function should be called whenever a ROAP message is received from the backend.
   *
   * @param roapMessage - ROAP message received
   */
  public roapMessageReceived(roapMessage: RoapMessage): Promise<void> {
    log(
      `[${this.id}] roapMessageReceived() called with messageType=${roapMessage.messageType}, seq=${roapMessage.seq}`,
    );

    // todo: fix this - currently we will call addLocalTracks each time we get new offer in incoming calls
    if (!this.localOfferInitiated && roapMessage.messageType === 'OFFER') {
      // this is the first SDP exchange, with an offer coming from the backend
      this.addLocalTracks();
    }

    return this.roap.roapMessageReceived(roapMessage);
  }

  private onRoapMessageToSend(event: RoapMessageEvent) {
    log(
      `[${this.id}] emitting Event.ROAP_MESSAGE_TO_SEND: messageType=${event.roapMessage.messageType}, seq=${event.roapMessage.seq}`,
    );
    this.emit(Event.ROAP_MESSAGE_TO_SEND, event);
  }

  private identifyTransceivers() {
    /* this is needed only in case of an incoming call where the first SDP offer comes from the far end */
    if (
      !this.transceivers.audio &&
      !this.transceivers.video &&
      !this.transceivers.screenShareVideo
    ) {
      const transceivers = this.pc.getTransceivers();

      log(`[${this.id}] identifyTransceivers(): transceivers.length=${transceivers.length}`);
      transceivers.forEach((transceiver, idx) => {
        log(`[${this.id}] identifyTransceivers(): transceiver[${idx}].mid=${transceiver.mid}`);
      });

      // todo: check if transceivers order always matches the m-lines in remote SDP offer in all the browsers
      [this.transceivers.audio, this.transceivers.video, this.transceivers.screenShareVideo] =
        transceivers;
    }
  }

  private onTrack(event: RTCTrackEvent) {
    log(`[${this.id}] onTrack() callback called: event=${JSON.stringify(event)}`);

    // TODO: this code is copied from the SDK, it relies on hardcoded MID values 0,1,2 later on we can look into improving this
    const MEDIA_ID = {
      AUDIO_TRACK: '0',
      VIDEO_TRACK: '1',
      SHARE_TRACK: '2',
    };

    const {track} = event;
    let trackMediaID = null;

    this.identifyTransceivers();

    // In case of safari on some os versions the transceiver is not present in the event,
    // so fall back to using the track id
    if (event.transceiver?.mid) {
      log(`[${this.id}] onTrack() identifying track by event.transceiver.mid`);
      trackMediaID = event.transceiver.mid; // todo: this might not work for "calling" project incoming calls
    } else if (track.id === this.transceivers.audio?.receiver?.track?.id) {
      trackMediaID = MEDIA_ID.AUDIO_TRACK;
    } else if (track.id === this.transceivers.video?.receiver?.track?.id) {
      trackMediaID = MEDIA_ID.VIDEO_TRACK;
    } else if (track.id === this.transceivers.screenShareVideo?.receiver?.track?.id) {
      trackMediaID = MEDIA_ID.SHARE_TRACK;
    } else {
      trackMediaID = null;
    }

    log(`[${this.id}] onTrack() trackMediaID=${trackMediaID}`);
    switch (trackMediaID) {
      case MEDIA_ID.AUDIO_TRACK:
        log(`[${this.id}] emitting Event.REMOTE_TRACK_ADDED with type=AUDIO`);
        this.emit(Event.REMOTE_TRACK_ADDED, {
          type: RemoteTrackType.AUDIO,
          track,
        });
        break;
      case MEDIA_ID.VIDEO_TRACK:
        log(`[${this.id}] emitting Event.REMOTE_TRACK_ADDED with type=VIDEO`);
        this.emit(Event.REMOTE_TRACK_ADDED, {
          type: RemoteTrackType.VIDEO,
          track,
        });
        break;
      case MEDIA_ID.SHARE_TRACK:
        log(`[${this.id}] emitting Event.REMOTE_TRACK_ADDED with type=SCREENSHARE_VIDEO`);
        this.emit(Event.REMOTE_TRACK_ADDED, {
          type: RemoteTrackType.SCREENSHARE_VIDEO,
          track,
        });
        break;
      default: {
        error(`[${this.id}] failed to match remote track media id: ${trackMediaID}`);
      }
    }
  }

  private addLocalTracks() {
    log(`[${this.id}] addLocalTracks(): adding tracks ${JSON.stringify(this.localTracks)}`);

    if (this.localTracks.audio) {
      this.pc.addTrack(this.localTracks.audio);
    }
    /* todo: this won't work correctly if we have a screenshare track but no video track (screenshare will be added to the wrong transceiver)
     * we will need to create some dummy video track and add it before adding screenshare */
    if (this.localTracks.video) {
      this.pc.addTrack(this.localTracks.video);
    }
    if (this.localTracks.screenShareVideo) {
      this.pc.addTrack(this.localTracks.screenShareVideo);
    }
  }

  private onConnectionStateChange() {
    log(
      `[${this.id}] onConnectionStateChange() callback called: connectionState=${this.pc.connectionState}`,
    );

    this.evaluateMediaConnectionState();
  }

  private onIceConnectionStateChange() {
    log(
      `[${this.id}] onIceConnectionStateChange() callback called: iceConnectionState=${this.pc.iceConnectionState}`,
    );

    this.evaluateMediaConnectionState();
  }

  private evaluateMediaConnectionState() {
    const rtcPcConnectionState = this.pc.connectionState;
    const iceState = this.pc.iceConnectionState;

    const connectionStates = [rtcPcConnectionState, iceState];

    if (connectionStates.some((value) => value === 'closed')) {
      this.mediaConnectionState = ConnectionState.CLOSED;
    } else if (connectionStates.some((value) => value === 'failed')) {
      this.mediaConnectionState = ConnectionState.FAILED;
    } else if (connectionStates.some((value) => value === 'disconnected')) {
      this.mediaConnectionState = ConnectionState.DISCONNECTED;
    } else if (connectionStates.every((value) => value === 'connected' || value === 'completed')) {
      this.mediaConnectionState = ConnectionState.CONNECTED;
    } else {
      this.mediaConnectionState = ConnectionState.CONNECTING;
    }

    log(
      `[${this.id}] evaluateConnectionState: iceConnectionState=${iceState} rtcPcConnectionState=${rtcPcConnectionState} => mediaConnectionState=${this.mediaConnectionState}`,
    );
    this.emit(Event.CONNECTION_STATE_CHANGED, {state: this.mediaConnectionState});
  }
}
