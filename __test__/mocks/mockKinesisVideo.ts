import { mockClient } from "aws-sdk-client-mock";
import {
  GetSignalingChannelEndpointCommand,
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput,
  KinesisVideo,
} from "@aws-sdk/client-kinesis-video";
import { AwsStub } from "aws-sdk-client-mock";
import * as getSignalingChannelEndpointCommandOutput from "../fixtures/getSignalingChannelEndpointCommandOutput.json";

const kinesisVideoMock = mockClient(KinesisVideo);

export function mockGetSignalingChannelEndpoints(
  error: Error | null,
  response: GetSignalingChannelEndpointCommandOutput = getSignalingChannelEndpointCommandOutput
): AwsStub<
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput
> {
  kinesisVideoMock
    .on(GetSignalingChannelEndpointCommand)
    [error ? "rejects" : "resolves"](error || response);

  // @ts-expect-error - ???
  return kinesisVideoMock;
}

export default kinesisVideoMock;
