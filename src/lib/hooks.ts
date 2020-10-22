import { useEffect, useReducer, useRef, useState } from "react";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
// import KinesisVideo = require("aws-sdk/clients/kinesisvideo");
// import KinesisVideoSignalingChannels = require("aws-sdk/clients/kinesisvideosignalingchannels");
import { KinesisVideo, KinesisVideoSignalingChannels } from "aws-sdk";
import { v4 as uuid } from "uuid";
import {
  ACTION_ADD_PEER_CONNECTION,
  ACTION_ADD_PEER_MEDIA,
  ACTION_CLEANUP_PEER,
  ACTION_REMOVE_PEER_CONNECTION,
  ERROR_CHANNEL_ARN_MISSING,
  ERROR_CONNECTION_OBJECT_NOT_PROVIDED,
  ERROR_ICE_CANDIDATE_NOT_FOUND,
  ERROR_ICE_SERVERS_RESPONSE,
  ERROR_PEER_CONNECTION_LOCAL_DESCRIPTION_REQUIRED,
  ERROR_PEER_CONNECTION_NOT_FOUND,
  ERROR_PEER_CONNECTION_NOT_INITIALIZED,
  ERROR_SIGNALING_CLIENT_NOT_CONNECTED,
} from "./constants";

type AWSCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

type SignalingChannelEndpoints = {
  WSS?: string;
  HTTPS?: string;
};

type MediaConfig = {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
};

interface ConfigOptions
  extends Record<string, string | AWSCredentials | MediaConfig> {
  channelARN: string;
  credentials: AWSCredentials;
  media: MediaConfig;
  region: string;
}

/**
 * @description Fetches ice servers for a signaling channel.
 **/
function useIceServers(config: {
  channelARN: string;
  channelEndpoint?: string;
  credentials: AWSCredentials;
  region: string;
}): RTCIceServer[] | undefined {
  const {
    channelARN,
    channelEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    region,
  } = config;

  const [iceServers, setIceServers] = useState<RTCIceServer[] | undefined>();

  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    const kinesisVideoSignalingChannelsClient = new KinesisVideoSignalingChannels(
      {
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: channelEndpoint,
        correctClockSkew: true,
      }
    );

    kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise()
      .then((getIceServerConfigResponse) => {
        if (!getIceServerConfigResponse) {
          throw new Error(ERROR_ICE_SERVERS_RESPONSE);
        }
        if (!getIceServerConfigResponse.IceServerList) {
          throw new Error(ERROR_ICE_SERVERS_RESPONSE);
        }

        const dict: RTCIceServer[] = [
          { urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` },
        ];

        getIceServerConfigResponse?.IceServerList?.forEach(
          (iceServer: KinesisVideoSignalingChannels.IceServer) => {
            if (!iceServer.Uris) {
              return;
            }
            dict.push({
              urls: iceServer.Uris,
              username: iceServer.Username,
              credential: iceServer.Password,
            });
          }
        );

        return dict;
      })
      .then(setIceServers);
  }, [accessKeyId, channelARN, channelEndpoint, region, secretAccessKey]);

  return iceServers;
}

/**
 * @description Fetches signaling channel endpoints.
 **/
function useSignalingChannelEndpoints(config: {
  channelARN: string;
  role: KVSWebRTC.Role;
  kinesisVideoClient: KinesisVideo;
}): SignalingChannelEndpoints | undefined {
  const { channelARN, kinesisVideoClient, role } = config;
  const [endpoints, setEndpoints] = useState<SignalingChannelEndpoints>();

  if (!channelARN) {
    throw new Error(ERROR_CHANNEL_ARN_MISSING);
  }

  useEffect(() => {
    kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ["WSS", "HTTPS"],
          Role: role,
        },
      })
      .promise()
      .then(mapSignalingChannelEndpoints)
      .then(setEndpoints);
  }, [channelARN, kinesisVideoClient, role]);

  return endpoints;
}

/**
 * @description Creates and opens a signaling channel. Closes connection on cleanup.
 **/
function useSignalingClient(config: {
  channelARN: string;
  credentials: AWSCredentials;
  channelEndpoint?: string;
  region: string;
  role: KVSWebRTC.Role;
  kinesisVideoClient: KinesisVideo;
}): KVSWebRTC.SignalingClient | undefined {
  const {
    channelARN,
    channelEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    kinesisVideoClient,
    region,
    role,
  } = config;

  const [clientId, setClientId] = useState<string | undefined>();
  const [client, setClient] = useState<KVSWebRTC.SignalingClient>();
  const { systemClockOffset } = kinesisVideoClient.config;

  /** Generate a client id for VIEWER role */
  useEffect(() => {
    if (role === KVSWebRTC.Role.VIEWER) {
      setClientId(uuid());
    }
  }, [role]);

  /** Create signaling client when endpoints are available. */
  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    setClient(
      new KVSWebRTC.SignalingClient({
        channelARN,
        channelEndpoint,
        ...(clientId ? { clientId } : null),
        credentials: { accessKeyId, secretAccessKey },
        region,
        role,
        systemClockOffset,
      })
    );
  }, [
    accessKeyId,
    channelARN,
    channelEndpoint,
    clientId,
    region,
    role,
    secretAccessKey,
    systemClockOffset,
  ]);

  /** Handle signaling client lifecycle. */
  useEffect(() => {
    client?.open();

    return function cleanup() {
      client?.close();
    };
  }, [client]);

  return client;
}

/**
 * @description Reducer for peer connections state.
 **/
interface PeerConnection {
  id: string;
  connection?: RTCPeerConnection;
  media?: MediaStream;
  handlers?: {
    iceCandidate?: (event: RTCPeerConnectionIceEvent) => void;
    iceConnectionStateChange?: (event: Event) => void;
    track?: (event: RTCTrackEvent) => void;
  };
  status: "ACTIVE" | "INACTIVE";
}

type PeerState = {
  entities: Map<string, PeerConnection>;
};

function usePeerState() {
  function peerReducer(
    state: PeerState,
    action: {
      type: string;
      payload?: {
        id: string;
        connection?: RTCPeerConnection;
        media?: MediaStream;
        handlers?: PeerConnection["handlers"];
      };
    }
  ): PeerState {
    const itemId = action.payload?.id;
    const item = itemId ? state.entities.get(itemId) : undefined;

    console.log(action.type);

    switch (action.type) {
      case ACTION_ADD_PEER_CONNECTION:
        if (!action.payload?.connection) {
          throw new Error(ERROR_CONNECTION_OBJECT_NOT_PROVIDED);
        }
        state.entities.set(action.payload.id, {
          ...action.payload,
          status: "ACTIVE",
        });
        break;
      case ACTION_ADD_PEER_MEDIA:
        if (!item || !itemId) {
          throw new Error(ERROR_PEER_CONNECTION_NOT_FOUND);
        }
        state.entities.set(itemId, { ...item, media: action.payload?.media });
        break;
      case ACTION_REMOVE_PEER_CONNECTION:
        if (!item || !itemId) {
          throw new Error(ERROR_PEER_CONNECTION_NOT_FOUND);
        }
        state.entities.set(itemId, { ...item, status: "INACTIVE" });
        break;
      case ACTION_CLEANUP_PEER:
        if (itemId) {
          state.entities.delete(itemId);
        }
        break;
      default:
        throw new Error("Action type not found");
    }

    console.log(state);

    return { ...state, entities: new Map(state.entities) };
  }

  return useReducer(peerReducer, { entities: new Map() });
}

/**
 * @description Handles peer connections to a master signaling client.
 **/
function useMasterPeerConnections(config: {
  channelARN: string;
  credentials: AWSCredentials;
  localMedia?: MediaStream;
  region: string;
}): { peerEntities: PeerState["entities"] } {
  const { channelARN, credentials, region } = config;
  const { accessKeyId, secretAccessKey } = credentials;
  const role = KVSWebRTC.Role.MASTER;

  const kinesisVideoClientRef = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    })
  );

  const kinesisVideoClient = kinesisVideoClientRef.current;
  const [peerState, dispatch] = usePeerState();

  const signalingChannelEndpoints = useSignalingChannelEndpoints({
    channelARN,
    kinesisVideoClient,
    role,
  });

  const signalingClient = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    credentials,
    kinesisVideoClient,
    region,
    role,
  });

  const iceServers = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  /** Handle peer connections. */
  useEffect(() => {
    const peerEntities = Array.from(peerState.entities.values());

    // Add event handlers
    for (const { connection, handlers } of peerEntities) {
      if (handlers?.iceCandidate) {
        connection?.addEventListener("icecandidate", handlers.iceCandidate);
      }
      if (handlers?.track) {
        connection?.addEventListener("track", handlers.track);
      }
      if (handlers?.iceConnectionStateChange) {
        connection?.addEventListener(
          "iceconnectionstatechange",
          handlers.iceConnectionStateChange
        );
      }
    }

    return function cleanup() {
      // Remove event handlers
      for (const { id, connection, handlers, media, status } of peerEntities) {
        if (handlers?.iceCandidate) {
          connection?.removeEventListener(
            "icecandidate",
            handlers.iceCandidate
          );
        }
        if (handlers?.track) {
          connection?.removeEventListener("track", handlers.track);
        }
        if (handlers?.iceConnectionStateChange) {
          connection?.removeEventListener(
            "iceconnectionstatechange",
            handlers.iceConnectionStateChange
          );
        }
        if (status === "INACTIVE") {
          connection?.close();
          media?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          dispatch({ type: ACTION_CLEANUP_PEER, payload: { id } });
        }
      }
    };
  }, [peerState.entities, dispatch]);

  /** Handle signaling client events. */
  useEffect(() => {
    signalingClient?.on("open", handleOpen);
    signalingClient?.on("sdpOffer", handleSdpOffer);

    function handleOpen() {
      void 0;
    }

    async function handleSdpOffer(offer: RTCSessionDescription, id: string) {
      const connection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: "all",
      });

      const handlers = {
        iceCandidate: handleIceCandidate,
        iceConnectionStateChange: handleIceConnectionStateChange,
        track: handleTrack,
      };

      dispatch({
        type: ACTION_ADD_PEER_CONNECTION,
        payload: { id, connection, handlers },
      });

      function handleIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
        if (candidate) {
          signalingClient?.sendIceCandidate(candidate, id);
        }
      }

      function handleIceConnectionStateChange() {
        if (connection.iceConnectionState === "disconnected") {
          dispatch({ type: ACTION_REMOVE_PEER_CONNECTION, payload: { id } });
        }
      }

      function handleTrack({ streams = [] }: RTCTrackEvent) {
        dispatch({
          type: ACTION_ADD_PEER_MEDIA,
          payload: { id, media: streams[0] },
        });
      }

      await connection.setRemoteDescription(offer);
      await connection.setLocalDescription(
        await connection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      if (connection.localDescription) {
        signalingClient?.sendSdpAnswer(connection.localDescription, id);
      }
    }

    return function cleanup() {
      signalingClient?.off("open", handleOpen);
      signalingClient?.off("sdpOffer", handleSdpOffer);
    };
  }, [dispatch, iceServers, signalingClient]);

  return { peerEntities: peerState.entities };
}

/**
 * @description Handles peer connection to a viewer signaling client.
 **/
function useViewerPeerConnection(config: {
  channelARN: string;
  credentials: AWSCredentials;
  region: string;
}): {
  error: Error | undefined;
  peerConnection: RTCPeerConnection | undefined;
  peerMedia: MediaStream | undefined;
} {
  const { channelARN, credentials, region } = config;
  const { accessKeyId, secretAccessKey } = credentials;
  const role = KVSWebRTC.Role.VIEWER;

  const kinesisVideoClientRef = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    })
  );

  const kinesisVideoClient = kinesisVideoClientRef.current;
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection>();
  const [peerMedia, setPeerMedia] = useState<MediaStream>();
  const [signalingClientError, setSignalingClientError] = useState<Error>();

  const signalingChannelEndpoints = useSignalingChannelEndpoints({
    channelARN,
    kinesisVideoClient,
    role,
  });

  const iceServers = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  const signalingClient = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    credentials,
    kinesisVideoClient,
    region,
    role,
  });

  /** Initialize the peer connection with ice servers. */
  useEffect(() => {
    if (iceServers) {
      setPeerConnection(
        new RTCPeerConnection({
          iceServers,
          iceTransportPolicy: "all",
        })
      );
    }
  }, [iceServers]);

  /** Handle signaling client and remote peer lifecycle. */
  useEffect(() => {
    if (!peerConnection) {
      return;
    }

    async function handleOpen() {
      await peerConnection?.setLocalDescription(
        await peerConnection?.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      if (!peerConnection?.localDescription) {
        throw new Error(ERROR_PEER_CONNECTION_LOCAL_DESCRIPTION_REQUIRED);
      }

      signalingClient?.sendSdpOffer(peerConnection.localDescription);
    }

    async function handleSdpAnswer(answer: RTCSessionDescriptionInit) {
      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }
      await peerConnection.setRemoteDescription(answer);
    }

    function handleSignalingChannelIceCandidate(candidate: RTCIceCandidate) {
      if (!candidate) {
        throw new Error(ERROR_ICE_CANDIDATE_NOT_FOUND);
      }
      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }
      peerConnection?.addIceCandidate(candidate);
    }

    function handlePeerIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
      if (!signalingClient) {
        throw new Error(ERROR_SIGNALING_CLIENT_NOT_CONNECTED);
      }
      if (candidate) {
        signalingClient.sendIceCandidate(candidate);
      }
    }

    function handlePeerTrack({ streams = [] }: RTCTrackEvent) {
      setPeerMedia(streams[0]);
    }

    signalingClient?.on("open", handleOpen);
    signalingClient?.on("sdpAnswer", handleSdpAnswer);
    signalingClient?.on("iceCandidate", handleSignalingChannelIceCandidate);
    signalingClient?.on("error", setSignalingClientError);

    peerConnection?.addEventListener("icecandidate", handlePeerIceCandidate);
    peerConnection?.addEventListener("track", handlePeerTrack);

    return function cleanup() {
      signalingClient?.off("open", handleOpen);
      signalingClient?.off("sdpAnswer", handleSdpAnswer);
      signalingClient?.off("iceCandidate", handleSignalingChannelIceCandidate);

      peerConnection?.removeEventListener(
        "icecandidate",
        handlePeerIceCandidate
      );
      peerConnection?.removeEventListener("track", handlePeerTrack);
      peerConnection?.close();
    };
  }, [peerConnection, signalingClient]);

  /** Handle peer media lifecycle. */
  useEffect(() => {
    return function cleanup() {
      peerMedia?.getTracks().forEach((track) => track.stop());
    };
  }, [peerMedia]);

  return { error: signalingClientError, peerConnection, peerMedia };
}

/**
 * @description Opens and returns local media stream. Closes stream on cleanup.
 **/
function useLocalMedia({
  audio = true,
  video = true,
}: {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
}): { error: Error | undefined; media: MediaStream | undefined } {
  const [media, setMedia] = useState<MediaStream>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then(setMedia)
      .catch(setError);
  }, [video, audio]);

  useEffect(() => {
    return function cleanup() {
      media?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    };
  }, [media]);

  return { error, media };
}

/**
 * @description Maps AWS KinesisVideo output to readable format.
 **/
function mapSignalingChannelEndpoints(
  data: KinesisVideo.GetSignalingChannelEndpointOutput
): SignalingChannelEndpoints {
  const endpointsByProtocol = data.ResourceEndpointList?.reduce(
    (
      endpoints: SignalingChannelEndpoints,
      endpoint: KinesisVideo.ResourceEndpointListItem
    ) => {
      if (!endpoint.Protocol) {
        return endpoints;
      }
      endpoints[endpoint.Protocol as "WSS" | "HTTPS"] =
        endpoint.ResourceEndpoint;
      return endpoints;
    },
    <SignalingChannelEndpoints>{}
  );

  return <SignalingChannelEndpoints>endpointsByProtocol;
}

/**
 * @description Opens a master connection using an existing signaling channel.
 **/
export function useMaster(
  config: ConfigOptions
): {
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peerMedia: Map<string, MediaStream> | undefined;
} {
  const {
    channelARN,
    credentials,
    region,
    media = { audio: true, video: true },
  } = config;
  const { error: mediaError, media: localMedia } = useLocalMedia(media);
  const { peerEntities } = useMasterPeerConnections({
    channelARN,
    credentials,
    localMedia,
    region,
  });

  // useEffect(() => {
  //   for (const { connection } of Array.from(peerEntities.values())) {
  //     localMedia
  //       ?.getTracks()
  //       .forEach((track: MediaStreamTrack) =>
  //         connection?.addTrack(track, localMedia)
  //       );
  //   }
  // }, [peerEntities, localMedia]);

  /** Construct map of peer media and return to caller. */
  const peerMedia = new Map();

  for (const { id, media, status } of Array.from(peerEntities.values())) {
    if (status === "ACTIVE") {
      peerMedia.set(id, media);
    }
  }

  return { error: mediaError, localMedia, peerMedia };
}

/**
 * @description Opens a viewer connection to an active master signaling channel.
 **/
export function useViewer(
  config: ConfigOptions
): {
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peerMedia: MediaStream | undefined;
} {
  const {
    channelARN,
    credentials,
    region,
    media = { audio: true, video: true },
  } = config;
  const { error: streamError, media: localMedia } = useLocalMedia(media);
  const {
    error: peerConnectionError,
    peerConnection,
    peerMedia,
  } = useViewerPeerConnection({
    channelARN,
    credentials,
    region,
  });

  /** Pass local media stream to remote peer. */
  useEffect(() => {
    localMedia
      ?.getTracks()
      .forEach((track: MediaStreamTrack) =>
        peerConnection?.addTrack(track, localMedia)
      );
  }, [localMedia, peerConnection]);

  return { error: streamError || peerConnectionError, localMedia, peerMedia };
}
