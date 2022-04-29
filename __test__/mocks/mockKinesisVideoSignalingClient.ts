import { mockClient, AwsStub } from "aws-sdk-client-mock";
import {
  GetIceServerConfigCommand,
  GetIceServerConfigCommandInput,
  GetIceServerConfigCommandOutput,
  KinesisVideoSignalingClient,
} from "@aws-sdk/client-kinesis-video-signaling";
import * as getIceServerConfigCommandOutput from "../fixtures/getIceServerConfigCommandOutput.json";

const kinesisVideoSignalingClientMock = mockClient(KinesisVideoSignalingClient);

export function mockGetIceServerConfig(
  error: Error | null,
  response: GetIceServerConfigCommandOutput = getIceServerConfigCommandOutput
): AwsStub<GetIceServerConfigCommandInput, GetIceServerConfigCommandOutput> {
  kinesisVideoSignalingClientMock
    .on(GetIceServerConfigCommand)
    [error ? "rejects" : "resolves"](error || response);

  return kinesisVideoSignalingClientMock;
}

export default kinesisVideoSignalingClientMock;
