import { useCallback, useEffect, useRef, useState } from "react";
import { Role, SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { KinesisVideo } from "@aws-sdk/client-kinesis-video";
import { useIceServers } from "./useIceServers";
import { useLocalMedia } from "./useLocalMedia";
import { usePeerReducer } from "./usePeerReducer";
import { useSignalingChannelEndpoints } from "./useSignalingChannelEndpoints";
import { useSignalingClient } from "./useSignalingClient";
import { ConfigOptions, PeerConfigOptions } from "../ConfigOptions";
import { getLogger } from "../logger";
import { Peer } from "../Peer";

/**
 * @description Handles peer connections to a master signaling client.
 **/
function useMasterPeerConnections(
  config: ConfigOptions & {
    localMedia: MediaStream | undefined;
    addPeer: (id: string, peer: Peer) => void;
    removePeer: (id: string) => void;
    updatePeer: (id: string, update: Partial<Peer>) => void;
  }
): {
  _signalingClient: SignalingClient | undefined;
  error: Error | undefined;
} {
  const {
    channelARN,
    credentials,
    debug = false,
    addPeer,
    removePeer,
    updatePeer,
    region,
  } = config;
  const logger = useRef(getLogger({ debug }));
  const role = Role.MASTER;
  const [sendIceCandidateError, setSendIceCandidateError] = useState<Error>();
  const kinesisVideoClient = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      credentials,
    })
  );

  const { error: signalingChannelEndpointsError, signalingChannelEndpoints } =
    useSignalingChannelEndpoints({
      channelARN,
      kinesisVideoClient: kinesisVideoClient.current,
      role,
    });

  const { error: signalingClientError, signalingClient } = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    credentials,
    region,
    role,
    systemClockOffset: kinesisVideoClient.current.config.systemClockOffset,
  });

  const { error: iceServersError, iceServers } = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  // this dict. is used to perform cleanup tasks
  const peerCleanup = useRef<Record<Peer["id"], () => void>>({});

  /**
   * Handle signaling client events.
   *
   * - This effect is designed to be invoked once per master session.
   * */
  useEffect(() => {
    if (!signalingClient || !iceServers) {
      return;
    }

    const externalError =
      signalingClientError || iceServersError || sendIceCandidateError;

    if (externalError) {
      logger.current.logMaster(
        `cleaning up signaling client after error: ${externalError.message}`
      );
      return cleanup();
    }

    function cleanup() {
      logger.current.logMaster("removing sdp offer listener");

      signalingClient?.off("sdpOffer", handleSdpOffer);

      for (const [id, fn] of Object.entries(peerCleanup.current)) {
        fn();
        removePeer(id);
        delete peerCleanup.current[id];
      }
    }

    /* sdp offer = new peer connection */
    async function handleSdpOffer(offer: RTCSessionDescription, id: string) {
      logger.current.logMaster("received sdp offer");

      const connection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: "all",
      });

      // this reference is used for cleanup
      let media: MediaStream;

      function handleIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
        logger.current.logMaster("received ice candidate");

        if (candidate) {
          try {
            signalingClient?.sendIceCandidate(candidate, id);
          } catch (error) {
            setSendIceCandidateError(error as Error);
          }
        }
      }

      function handleIceConnectionStateChange() {
        logger.current.logMaster(
          `ice connection state change: ${connection.iceConnectionState}`
        );

        if (
          ["closed", "disconnected", "failed"].includes(
            connection.iceConnectionState
          )
        ) {
          removePeer(id);
          peerCleanup.current[id]?.();
          delete peerCleanup.current[id];
        }
      }

      function handleTrack({ streams = [] }: RTCTrackEvent) {
        logger.current.logMaster("received peer track");

        media = streams[0];
        updatePeer(id, { media });
      }

      connection.addEventListener("icecandidate", handleIceCandidate);
      connection.addEventListener("track", handleTrack);
      connection.addEventListener(
        "iceconnectionstatechange",
        handleIceConnectionStateChange
      );

      addPeer(id, { id, connection });
      peerCleanup.current[id] = () => {
        logger.current.logMaster(`cleaning up peer ${id}`);

        media?.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });

        connection.close();
        connection.removeEventListener("icecandidate", handleIceCandidate);
        connection.removeEventListener("track", handleTrack);
        connection.removeEventListener(
          "iceconnectionstatechange",
          handleIceConnectionStateChange
        );
      };

      await connection.setRemoteDescription(offer);
      await connection.setLocalDescription(
        await connection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      signalingClient?.sendSdpAnswer(
        connection.localDescription as RTCSessionDescription,
        id
      );
    }

    logger.current.logMaster("adding sdp offer listener");
    signalingClient.on("sdpOffer", handleSdpOffer);

    return cleanup;
  }, [
    addPeer,
    iceServers,
    iceServersError,
    logger,
    peerCleanup,
    removePeer,
    sendIceCandidateError,
    signalingClient,
    signalingClientError,
    updatePeer,
  ]);

  return {
    _signalingClient: signalingClient,
    error:
      signalingChannelEndpointsError ||
      signalingClientError ||
      iceServersError ||
      sendIceCandidateError,
  };
}

/**
 * @description Opens a master connection using an existing signaling channel.
 **/
export function useMaster(config: PeerConfigOptions): {
  _signalingClient: SignalingClient | undefined;
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peers: Array<Peer>;
} {
  const {
    channelARN,
    credentials,
    debug = false,
    region,
    media = { audio: true, video: true },
  } = config;
  const logger = getLogger({ debug });
  const { error: mediaError, media: localMedia } = useLocalMedia(media);
  const [peers, dispatch] = usePeerReducer({});

  /* Handle peer side effects */
  useEffect(() => {
    for (const peer of Object.values(peers)) {
      if (peer.isWaitingForMedia) {
    if (!localMedia) {
          continue;
    }
        localMedia.getTracks().forEach((track: MediaStreamTrack) => {
          peer.connection?.addTrack(track, localMedia);
        });
        dispatch({
          type: "update",
          payload: { id: peer.id, isWaitingForMedia: false },
        });
      }
    }
  }, [dispatch, localMedia, peers]);

  logger.logMaster({ peers });

  const { _signalingClient, error: peerConnectionsError } =
    useMasterPeerConnections({
      channelARN,
      credentials,
      debug,
      localMedia,
      region,
      addPeer: useCallback(
        (id, peer) => {
          dispatch({
            type: "add",
            payload: { ...peer, isWaitingForMedia: true },
          });
        },
        [dispatch]
      ),
      removePeer: useCallback(
        (id) => {
          dispatch({ type: "remove", payload: { id } });
        },
        [dispatch]
      ),
      updatePeer: useCallback(
        (id, update) =>
          dispatch({ type: "update", payload: { id, ...update } }),
        [dispatch]
      ),
    });

  return {
    _signalingClient,
    error: mediaError || peerConnectionsError,
    localMedia,
    peers: Object.values(peers),
  };
}
