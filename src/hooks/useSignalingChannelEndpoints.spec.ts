import { cleanup, renderHook } from "@testing-library/react-hooks";
import {
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput,
} from "@aws-sdk/client-kinesis-video";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import { AwsStub } from "aws-sdk-client-mock";
import * as getSignalingChannelEndpointCommandOutput from "../../__test__/fixtures/getSignalingChannelEndpointCommandOutput.json";
import kinesisVideoMock, {
  mockGetSignalingChannelEndpoints,
} from "../../__test__/mocks/mockKinesisVideo";
import { useSignalingChannelEndpoints } from "./useSignalingChannelEndpoints";

let getSignalingChannelEndpointsMock: AwsStub<
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput
>;

beforeEach(() => {
  getSignalingChannelEndpointsMock = mockGetSignalingChannelEndpoints(null);
});

afterEach(() => {
  getSignalingChannelEndpointsMock.reset();
});

test("returns a list of signaling channel endpoints", async () => {
  getSignalingChannelEndpointsMock = mockGetSignalingChannelEndpoints(
    null,
    getSignalingChannelEndpointCommandOutput
  );
  const { result, waitForNextUpdate } = renderHook(() =>
    useSignalingChannelEndpoints({
      channelARN: "x",
      role: KVSWebRTC.Role.MASTER,
      // @ts-expect-error - client mock
      kinesisVideoClient: kinesisVideoMock,
    })
  );
  await waitForNextUpdate();
  expect(result.current.signalingChannelEndpoints).toEqual({
    WSS: "wss://test",
    HTTPS: "https://test",
  });
});

test("returns an error", async () => {
  const error = new Error();
  getSignalingChannelEndpointsMock = mockGetSignalingChannelEndpoints(error);
  const { result, waitForNextUpdate } = renderHook(() =>
    useSignalingChannelEndpoints({
      channelARN: "x",
      role: KVSWebRTC.Role.MASTER,
      // @ts-expect-error - client mock
      kinesisVideoClient: kinesisVideoMock,
    })
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(error);
});

test("cancels request on cleanup", async () => {
  const { result } = renderHook(() =>
    useSignalingChannelEndpoints({
      channelARN: "x",
      role: KVSWebRTC.Role.MASTER,
      // @ts-expect-error - client mock
      kinesisVideoClient: kinesisVideoMock,
    })
  );
  await cleanup();
  expect(result.current.signalingChannelEndpoints).toBeUndefined();
});
