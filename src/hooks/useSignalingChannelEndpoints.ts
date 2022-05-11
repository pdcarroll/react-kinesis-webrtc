import { useEffect, useState } from "react";
import {
  GetSignalingChannelEndpointCommand,
  GetSignalingChannelEndpointOutput,
  KinesisVideo,
  ResourceEndpointListItem,
} from "@aws-sdk/client-kinesis-video";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import {
  ERROR_CHANNEL_ARN_MISSING,
  ERROR_RESOURCE_ENDPOINT_LIST_MISSING,
} from "../constants";
import { withErrorLog } from "../withErrorLog";

type SignalingChannelEndpoints = {
  WSS?: string;
  HTTPS?: string;
};

/**
 * @description Maps AWS KinesisVideo output to readable format.
 **/
function mapSignalingChannelEndpoints(
  data: GetSignalingChannelEndpointOutput
): SignalingChannelEndpoints {
  if (!Array.isArray(data.ResourceEndpointList)) {
    throw new Error(ERROR_RESOURCE_ENDPOINT_LIST_MISSING);
  }

  const endpointsByProtocol = data.ResourceEndpointList.reduce(
    (
      endpoints: SignalingChannelEndpoints,
      endpoint: ResourceEndpointListItem
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
 * @description Fetches signaling channel endpoints.
 **/
export function useSignalingChannelEndpoints(config: {
  channelARN: string;
  role: KVSWebRTC.Role;
  kinesisVideoClient: KinesisVideo;
}): {
  error: Error | undefined;
  signalingChannelEndpoints: SignalingChannelEndpoints | undefined;
} {
  const { channelARN, kinesisVideoClient, role } = config;
  const [error, setError] = useState<Error>();
  const [signalingChannelEndpoints, setSignalingChannelEndpoints] =
    useState<SignalingChannelEndpoints>();

  if (!channelARN) {
    throw new Error(ERROR_CHANNEL_ARN_MISSING);
  }

  useEffect(() => {
    let isCancelled = false;

    const command = new GetSignalingChannelEndpointCommand({
      ChannelARN: channelARN,
      SingleMasterChannelEndpointConfiguration: {
        Protocols: ["WSS", "HTTPS"],
        Role: role,
      },
    });

    kinesisVideoClient
      .send(command)
      .then(mapSignalingChannelEndpoints)
      .then((endpoints) => {
        if (isCancelled) {
          return;
        }
        setSignalingChannelEndpoints(endpoints);
      })
      .catch(
        withErrorLog((error) => {
          if (isCancelled) {
            return;
          }
          setError(typeof error === "string" ? new Error(error) : error);
        })
      );

    return function cleanup() {
      isCancelled = true;
    };
  }, [channelARN, kinesisVideoClient, role]);

  return { error, signalingChannelEndpoints };
}
