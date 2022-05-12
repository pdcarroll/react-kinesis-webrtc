import { useCallback, useEffect, useRef, useState } from "react";
import { Role, SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { KinesisVideo } from "@aws-sdk/client-kinesis-video";
import { useIceServers } from "./useIceServers";
import { useLocalMedia } from "./useLocalMedia";
import { usePeerReducer } from "./usePeerReducer";
import { useSignalingChannelEndpoints } from "./useSignalingChannelEndpoints";
import { useSignalingClient } from "./useSignalingClient";
import { PeerConfigOptions } from "../ConfigOptions";
import { getLogger } from "../logger";
import { Peer } from "../Peer";

/**
 * @description Opens a master connection using an existing signaling channel.
 **/
export function useMaster(config: PeerConfigOptions): {
  _signalingClient: SignalingClient | undefined;
  error: Error | undefined;
  isOpen: boolean;
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

  const logger = useRef(getLogger({ debug }));
  const role = Role.MASTER;
  const {
    error: mediaError,
    media: localMedia,
    cancel: cancelLocalMedia,
  } = useLocalMedia(media);
  const [peers, dispatch] = usePeerReducer({});
  const [sendIceCandidateError, setSendIceCandidateError] = useState<Error>();
  const [isOpen, setIsOpen] = useState(false);
  const localMediaIsActive = Boolean(localMedia);

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

  const { error: iceServersError, iceServers } = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  const { error: signalingClientError, signalingClient } = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    credentials,
    region,
    role,
    systemClockOffset: kinesisVideoClient.current.config.systemClockOffset,
  });

  // this dict. is used to perform cleanup tasks
  const peerCleanup = useRef<Record<Peer["id"], () => void>>({});

  const addPeer = useCallback(
    (id, peer) => {
      dispatch({
        type: "add",
        payload: { ...peer, isWaitingForMedia: true },
      });
    },
    [dispatch]
  );

  const removePeer = useCallback(
    (id) => {
      dispatch({ type: "remove", payload: { id } });
    },
    [dispatch]
  );

  const updatePeer = useCallback(
    (id, update) => dispatch({ type: "update", payload: { id, ...update } }),
    [dispatch]
  );

  const externalError =
    signalingChannelEndpointsError ||
    signalingClientError ||
    iceServersError ||
    sendIceCandidateError;

  /* Cancel the local media stream when an error occurs */
  useEffect(() => {
    if (!externalError) {
      return;
    }
    logger.current.logMaster("cancelling local media stream");
    cancelLocalMedia();
  }, [externalError, cancelLocalMedia]);

  /**
   * Handle signaling client events.
   *
   * - This effect is designed to be invoked once per master session.
   * */
  useEffect(() => {
    if (!signalingClient || !iceServers || !localMediaIsActive) {
      return;
    }

    if (externalError) {
      logger.current.logMaster(
        `cleaning up signaling client after error: ${externalError.message}`
      );
      return cleanup();
    }

    function cleanup() {
      logger.current.logMaster("cleaning up peer connections");

      signalingClient?.close();
      signalingClient?.off("sdpOffer", handleSignalingClientSdpOffer);
      signalingClient?.off("open", handleSignalingClientOpen);

      setIsOpen(false);

      for (const [id, fn] of Object.entries(peerCleanup.current)) {
        fn();
        removePeer(id);
        delete peerCleanup.current[id];
      }
    }

    /* sdp offer = new peer connection */
    async function handleSignalingClientSdpOffer(
      offer: RTCSessionDescription,
      id: string
    ) {
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

    function handleSignalingClientOpen() {
      setIsOpen(true);
    }

    signalingClient.on("sdpOffer", handleSignalingClientSdpOffer);
    signalingClient.on("open", handleSignalingClientOpen);
    signalingClient.open();

    return cleanup;
  }, [
    addPeer,
    externalError,
    iceServers,
    localMediaIsActive,
    logger,
    peerCleanup,
    removePeer,
    signalingClient,
    updatePeer,
  ]);

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

  logger.current.logMaster({ peers });

  return {
    _signalingClient: signalingClient,
    error: mediaError || externalError,
    isOpen,
    localMedia,
    peers: Object.values(peers),
  };
}
