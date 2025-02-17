import EventEmitter from 'events';

import { DEVICE, MEDIA } from '../constants';
import logger from '../Logger';
import { Device, DeviceInterface, DeviceKinds } from './Device';
import { Track, TrackInterface } from './Track';

/* eslint no-underscore-dangle: ["error", { "allow": ["_streams"] }] */

// Can also convert the Media into class if you want but this should work
const eventEmitter = new EventEmitter();
const deviceList: Array<MediaDeviceInfo> = [];

/**
 * Requests a list of the available media input and output devices, such as microphones and cameras.
 *
 * @returns Promise Array of MediaDeviceInfo objects
 */
const getDevices = async (): Promise<MediaDeviceInfo[]> => {
  logger.debug({
    mediaType: DEVICE,
    action: 'getDevices()',
    description: 'Called',
  });

  if (!navigator.mediaDevices?.enumerateDevices) {
    console.warn('navigator.mediaDevices.enumerateDevices() is not supported.');

    return [];
  }
  logger.info({
    mediaType: DEVICE,
    action: 'getDevices()',
    description: 'Requesting list of available media input and output devices',
  });

  return navigator.mediaDevices.enumerateDevices();
};

/**
 * Handles getting a list of video input devices
 *
 * @returns Promise Array of MediaDeviceInfo objects
 * @public
 */
const getCameras = async (): Promise<Device[]> => {
  logger.debug({
    mediaType: DEVICE,
    action: 'getCameras()',
    description: 'Called',
  });
  const devices = await getDevices();

  logger.info({
    mediaType: DEVICE,
    action: 'getCameras()',
    description: 'Filtering camera devices from all available media devices',
  });

  return devices
    .filter(({kind}) => kind === DeviceKinds.VIDEO_INPUT)
    .map((device) => {
      logger.debug({
        ID: device.deviceId,
        mediaType: DEVICE,
        action: 'getCameras()',
        description: `Received camera device ${JSON.stringify(device)}`,
      });

      return new Device(device);
    });
};

/**
 * Handles getting a list of audio input devices
 *
 * @returns Promise Array of MediaDeviceInfo objects
 * @public
 */
const getMicrophones = async (): Promise<Device[]> => {
  logger.debug({
    mediaType: DEVICE,
    action: 'getMicrophones()',
    description: 'Called',
  });
  const devices = await getDevices();

  logger.info({
    mediaType: DEVICE,
    action: 'getMicrophones()',
    description: 'Filtering microphones devices from all available media devices',
  });

  return devices
    .filter(({kind}) => kind === DeviceKinds.AUDIO_INPUT)
    .map((device) => {
      logger.debug({
        ID: device.deviceId,
        mediaType: DEVICE,
        action: 'getMicrophones()',
        description: `Received microphone device ${JSON.stringify(device)}`,
      });

      return new Device(device);
    });
};

/**
 * Handles getting a list of audio output devices
 *
 * @returns Promise Array of MediaDeviceInfo objects
 * @public
 */
const getSpeakers = async (): Promise<Device[]> => {
  logger.debug({
    mediaType: DEVICE,
    action: 'getSpeakers()',
    description: 'Called',
  });
  const devices = await getDevices();

  logger.info({
    mediaType: DEVICE,
    action: 'getSpeakers()',
    description: 'Filtering speaker devices from all available media devices',
  });

  return devices
    .filter(({kind}) => kind === DeviceKinds.AUDIO_OUTPUT)
    .map((device) => {
      logger.debug({
        ID: device.deviceId,
        mediaType: DEVICE,
        action: 'getSpeakers()',
        description: `Received speaker device ${JSON.stringify(device)}`,
      });

      return new Device(device);
    });
};

/**
 * Match passed constraints with supported constraints
 * and return all unsupported constraints
 *
 * @param mediaConstraints - Contraints passed by caller
 * @returns
 */
function getUnsupportedConstraints(mediaConstraints: MediaTrackConstraints): Array<string> {
  logger.debug({
    mediaType: MEDIA,
    action: 'getUnsupportedConstraints()',
    description: `Called with ${JSON.stringify(mediaConstraints)}`,
  });
  logger.info({
    mediaType: MEDIA,
    action: 'getUnsupportedConstraints()',
    description: 'Filtering list of media track unsupported constraints',
  });
  // eslint-disable-next-line max-len
  const supportedConstraints: MediaTrackSupportedConstraints =
    navigator.mediaDevices.getSupportedConstraints();
  const unsupportedConstraints: Array<string> = [];

  Object.keys(mediaConstraints).forEach((constraint: string) => {
    if (
      !(
        Object.prototype.hasOwnProperty.call(supportedConstraints, constraint) &&
        supportedConstraints[constraint as keyof MediaTrackSupportedConstraints]
      )
    ) {
      unsupportedConstraints.push(constraint);
    }
  });
  logger.debug({
    mediaType: MEDIA,
    action: 'getUnsupportedConstraints()',
    description: `Received unsupported constraints ${unsupportedConstraints}`,
  });

  return unsupportedConstraints;
}

/**
 * Handles getting a track from either a provided device or a default device
 *
 * @param device - device object where the track will be retrieved from (optional)
 * @returns Promise of Track object
 */
async function createAudioTrack(device?: DeviceInterface): Promise<TrackInterface> {
  logger.debug({
    ID: device?.ID,
    mediaType: DEVICE,
    action: 'createAudioTrack()',
    description: `Called ${device ? `with ${JSON.stringify(device)}` : ''} `,
  });

  if (device && device.kind !== DeviceKinds.AUDIO_INPUT) {
    const error = new Error(`Device ${device.ID} is not of kind AUDIO_INPUT`);

    logger.error({
      ID: device.ID,
      mediaType: 'DEVICE',
      action: 'createAudioTrack()',
      description: error.message,
      error,
    });

    throw error;
  }
  logger.info({
    ID: device?.ID,
    mediaType: DEVICE,
    action: 'createAudioTrack()',
    description: 'Creating audio track',
  });

  const deviceConfig = device
    ? {
        audio: {
          deviceId: {
            exact: device.ID,
          },
        },
      }
    : {
        audio: true,
        video: false,
      };
  const stream: MediaStream = await navigator.mediaDevices.getUserMedia(deviceConfig);
  const track: MediaStreamTrack = stream.getAudioTracks()[0];

  if (track) {
    logger.debug({
      ID: device?.ID,
      mediaType: DEVICE,
      action: 'createAudioTrack()',
      description: `Received audio track ${JSON.stringify(track)}`,
    });

    return new Track(track);
  }

  const error = new Error(`Device could not obtain an audio track of kind ${device?.kind}`);

  logger.error({
    ID: device?.ID,
    mediaType: 'DEVICE',
    action: 'createAudioTrack()',
    description: error.message,
    error,
  });

  throw error;
}

/**
 * Handles getting a track from either a provided device or a default device
 *
 * @param device - device object where the track will be retrieved from (optional)
 * @returns Promise of Track object
 */
async function createVideoTrack(device?: DeviceInterface): Promise<TrackInterface> {
  logger.debug({
    ID: device?.ID,
    mediaType: DEVICE,
    action: 'createVideoTrack()',
    description: `Called ${device ? `with ${JSON.stringify(device)}` : ''} `,
  });
  if (device && device.kind !== DeviceKinds.VIDEO_INPUT) {
    const error = new Error(`Device ${device.ID} is not of kind VIDEO_INPUT`);

    logger.error({
      ID: device.ID,
      mediaType: 'DEVICE',
      action: 'createVideoTrack()',
      description: error.message,
      error,
    });

    throw error;
  }
  logger.info({
    ID: device?.ID,
    mediaType: DEVICE,
    action: 'createVideoTrack()',
    description: 'Creating video track',
  });

  const deviceConfig = device
    ? {
        video: {
          deviceId: {
            exact: device.ID,
          },
        },
      }
    : {
        audio: false,
        video: true,
      };
  const stream: MediaStream = await navigator.mediaDevices.getUserMedia(deviceConfig);
  const track: MediaStreamTrack = stream.getVideoTracks()[0];

  if (track) {
    logger.debug({
      ID: device?.ID,
      mediaType: DEVICE,
      action: 'createVideoTrack()',
      description: `Received video track ${JSON.stringify(track)}`,
    });

    return new Track(track);
  }

  const error = new Error(`Device could not obtain a video track of kind ${device?.kind}`);

  logger.error({
    ID: device?.ID,
    mediaType: 'DEVICE',
    action: 'createVideoTrack()',
    description: error.message,
    error,
  });

  throw error;
}

/**
 * Handles getting a content track with passed constraints
 *
 * @param mediaConstraints - passed constraints for content track
 *
 * @returns Promise of Track object
 *
 * @throws - Could not obtain a content track
 * Thrown if stream is empty or track is null
 *
 * @throws - Constraint is not supported by browser
 * Thrown if unsupported constraint is being passed to the function
 */
async function createContentTrack(
  mediaConstraints?: MediaTrackConstraints
): Promise<TrackInterface> {
  logger.debug({
    ID: mediaConstraints?.deviceId?.toString(),
    mediaType: DEVICE,
    action: 'createContentTrack()',
    description: `Called ${mediaConstraints ? `with ${JSON.stringify(mediaConstraints)}` : ''} `,
  });
  logger.info({
    ID: mediaConstraints?.deviceId?.toString(),
    mediaType: MEDIA,
    action: 'createContentTrack()',
    description: 'Creating content track',
  });

  const deviceConfig = {
    audio: false,
    video: true,
  };

  let track: MediaStreamTrack;
  let stream: MediaStream;

  try {
    // Typescript Compiler is not able find Definition of getDisplayMedia in mediaDevices interface.
    // That is the reason we are using ts-ignore here for ignoring this open issue in mediaDevices
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    stream = await navigator.mediaDevices.getDisplayMedia(deviceConfig);
    [track] = stream.getVideoTracks();
  } catch (error) {
    if (error instanceof Error) {
      logger.error({
        ID: mediaConstraints?.deviceId?.toString(),
        mediaType: 'DEVICE',
        action: 'createContentTrack()',
        description: error.message,
        error,
      });
    }

    throw error;
  }

  if (mediaConstraints) {
    const unsupportedConstraints: Array<string> = getUnsupportedConstraints(mediaConstraints);

    if (unsupportedConstraints.length <= 0) {
      track.applyConstraints(mediaConstraints);

      logger.debug({
        ID: mediaConstraints?.deviceId?.toString(),
        mediaType: DEVICE,
        action: 'createContentTrack()',
        description: 'Applied media constraints to fetched content track',
      });
    } else {
      const error = new Error(
        `${unsupportedConstraints.join(', ')} constraint is not supported by browser`
      );

      logger.error({
        ID: mediaConstraints?.deviceId?.toString(),
        mediaType: 'DEVICE',
        action: 'createContentTrack()',
        description: error.message,
        error,
      });

      throw error;
    }
  }

  if (track) {
    logger.debug({
      ID: mediaConstraints?.deviceId?.toString(),
      mediaType: DEVICE,
      action: 'createContentTrack()',
      description: `Received content track ${JSON.stringify(track)}`,
    });

    return new Track(track);
  }

  const error = new Error('Could not obtain a content track');

  logger.error({
    ID: mediaConstraints?.deviceId?.toString(),
    mediaType: 'DEVICE',
    action: 'createContentTrack()',
    description: error.message,
    error,
  });

  throw error;
}

/*
 * Makes calls to individual subscription listeners obtained through on method
 * @returns promise that is resolved with void
 */
async function deviceChangePublisher(): Promise<void> {
  logger.debug({
    mediaType: DEVICE,
    action: 'deviceChangePublisher()',
    description: 'Called',
  });
  if (!navigator.mediaDevices?.enumerateDevices) {
    console.warn('navigator.mediaDevices.enumerateDevices() is not supported.');

    return;
  }

  logger.info({
    mediaType: DEVICE,
    action: 'deviceChangePublisher()',
    description: 'Calling individual subscription listener obtained by device change event',
  });
  const newDeviceList: Array<MediaDeviceInfo> = await navigator.mediaDevices.enumerateDevices();
  let filtered: Array<MediaDeviceInfo> = [];
  let getGroupIdsFrom: Array<MediaDeviceInfo> = [];
  let filterDevicesFrom: Array<MediaDeviceInfo> = [];
  let action = 'changed';
  const deviceListGroups = new Set();

  if (newDeviceList.length !== deviceList.length) {
    /**
     * When a phyisical device is removed / added, two MediaDevice gets added
     * One input & one output device.
     * `groupid` is the only thing common between these two MediaDevices
     * So, the following code is to filter both of those devices based on group ID to pass on to subscribed listeners
     */
    [getGroupIdsFrom, filterDevicesFrom, action] =
      newDeviceList.length < deviceList.length
        ? [newDeviceList, deviceList, 'removed']
        : [deviceList, newDeviceList, 'added'];

    getGroupIdsFrom.forEach((device) => {
      deviceListGroups.add(device.groupId);
    });

    filtered = filterDevicesFrom.filter((device) => !deviceListGroups.has(device.groupId));

    deviceList.splice(0, deviceList.length);
    deviceList.push(...newDeviceList);

    eventEmitter.emit('device:changed', {
      action,
      devices: filtered,
    });
  }
}

/**
 * Obtains multiple subscriptions for various media events and stores listeners
 * Also sets appropriate browser event listeners
 *
 * @param eventName - event name to on to (device:changed)
 * @param listener - callback method to call when an event occurs
 * @returns promise that resolves with subscription object that can be used to off
 */
async function on(eventName: string, listener: () => void) {
  logger.debug({
    mediaType: MEDIA,
    action: 'on()',
    description: `Subscribing to an ${eventName},${listener}`,
  });

  eventEmitter.on(eventName, listener);

  if (eventName === 'device:changed') {
    const thisDeviceList = await getDevices();

    deviceList.push(...thisDeviceList);
    navigator.mediaDevices.addEventListener('devicechange', deviceChangePublisher);
  }
}

/**
 * Returns true when unsubscriptions happened successfully, `false` otherwise
 * When a `Subscription` object is pass only that subscription will be removed
 * If no subscriptions are given, all current subscription will be unsubscribed

 * @param subscriptionInstance -optional subscription object that has property type and has a method that needs to be deleted from subscriptions state
 * @returns `true` when subscription is found and unsubscribed, `false` otherwise
 */
const off = (eventName: string, listener: () => void) => {
  logger.debug({
    mediaType: MEDIA,
    action: 'off()',
    description: `Called ${eventName} with ${listener} listener`,
  });
  eventEmitter.off(eventName, listener);
  // We dont have to turn on or off the deviceList as SDK we need to keep track of it
};

/** Creates peer to peer connection and gets the offer
 * if spd of offer matches codec h246 then it return true and connection is established else will return false and log that connection has failed
 * @returns -boolean
 */

const hasH264Codec = async () => {
  let hasCodec = false;

  try {
    const peerConnection = new window.RTCPeerConnection();
    const offer = await peerConnection.createOffer({
      offerToReceiveVideo: true,
    });

    if (offer?.sdp?.match(/^a=rtpmap:\d+\s+H264\/\d+/m)) {
      hasCodec = true;
    }
    peerConnection.close();
  } catch (error) {
    logger.debug({
      mediaType: MEDIA,
      action: 'hasH264Codec()',
      description: `Meetings:util#hasH264Codec---->  Error creating peerConnection for H.264 test`,
    });
  }

  return hasCodec;
};

/** Notifies the user whether or not the H.264
 * codec is present
 * @returns -boolean
 */
const isCodecAvailable = async (): Promise<boolean> => {
  const isCodec = await hasH264Codec();

  return isCodec;
};

export * from './Device';
export * from './Track';
export {
  getDevices,
  getCameras,
  getMicrophones,
  getSpeakers,
  createAudioTrack,
  createVideoTrack,
  createContentTrack,
  on,
  off,
  isCodecAvailable,
};
