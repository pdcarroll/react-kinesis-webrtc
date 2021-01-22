import { useEffect, useState } from "react";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import {
  GetSignalingChannelEndpointOutput,
  KinesisVideo,
  ResourceEndpointListItem,
} from "@aws-sdk/client-kinesis-video";
import { ERROR_CHANNEL_ARN_MISSING } from "../constants";

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
  const endpointsByProtocol = data.ResourceEndpointList?.reduce(
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
      .then(mapSignalingChannelEndpoints)
      .then(setEndpoints);
  }, [channelARN, kinesisVideoClient, role]);

  return endpoints;
}
