import { useEffect, useState } from "react";
import {
  GetIceServerConfigCommand,
  KinesisVideoSignalingClient,
  IceServer,
} from "@aws-sdk/client-kinesis-video-signaling";
import { ConfigOptions } from "../ConfigOptions";
import { ERROR_ICE_SERVERS_RESPONSE } from "../constants";
import { withErrorLog } from "../withErrorLog";

/**
 * @description Fetches ice servers for a signaling channel.
 **/
export function useIceServers(
  config: ConfigOptions & {
    channelEndpoint: string | undefined;
  }
): {
  error: Error | undefined;
  iceServers: RTCIceServer[] | undefined;
} {
  const {
    channelARN,
    channelEndpoint,
    credentials: { accessKeyId = "", secretAccessKey = "", sessionToken = undefined} = {},
    region,
  } = config;
  const [error, setError] = useState<Error>();
  const [iceServers, setIceServers] = useState<RTCIceServer[]>();

  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }

    let isCancelled = false;

    const kinesisVideoSignalingChannelsClient = new KinesisVideoSignalingClient(
      {
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
          sessionToken,
        },
        endpoint: channelEndpoint,
      }
    );

    const getIceServerConfigCommand = new GetIceServerConfigCommand({
      ChannelARN: channelARN,
    });

    kinesisVideoSignalingChannelsClient
      .send(getIceServerConfigCommand)
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
          (iceServer: IceServer) => {
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
      .then((iceServers) => {
        if (isCancelled) {
          return;
        }
        setIceServers(iceServers);
      })
      .catch(
        withErrorLog((error) => {
          if (isCancelled) {
            return;
          }
          setError(error);
        })
      );

    return function cleanup() {
      isCancelled = true;
    };
  }, [accessKeyId, channelARN, channelEndpoint, region, secretAccessKey]);

  return { error, iceServers };
}
