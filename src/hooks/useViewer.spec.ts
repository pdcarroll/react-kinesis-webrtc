import { act, cleanup, renderHook } from "@testing-library/react-hooks";
import {
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput,
} from "@aws-sdk/client-kinesis-video";
import {
  GetIceServerConfigCommandInput,
  GetIceServerConfigCommandOutput,
} from "@aws-sdk/client-kinesis-video-signaling";
import { AwsStub } from "aws-sdk-client-mock";
import { SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import * as mockConfig from "../../__test__/fixtures/config.json";
import {
  mockMediaDevices,
  mockGetUserMedia,
  mockMediaTrack,
  mockUserMediaStream,
} from "../../__test__/mocks/mockNavigator";
import { mockGetSignalingChannelEndpoints } from "../../__test__/mocks/mockKinesisVideo";
import { mockGetIceServerConfig } from "../../__test__/mocks/mockKinesisVideoSignalingClient";
import { mockRTCPeerConnection } from "../../__test__/mocks/mockRTCPeerConnection";
import { mockSignalingClient } from "../../__test__/mocks/mockSignalingClient";
import { useViewer } from "./useViewer";

const mockViewerConfig = {
  ...mockConfig,
  media: { audio: true, video: true },
};

let getIceServerConfigMock: AwsStub<
  GetIceServerConfigCommandInput,
  GetIceServerConfigCommandOutput
>;
let getSignalingChannelEndpointsMock: AwsStub<
  GetSignalingChannelEndpointCommandInput,
  GetSignalingChannelEndpointCommandOutput
>;

beforeEach(() => {
  mockMediaDevices();
  mockRTCPeerConnection();
  mockSignalingClient();
  getIceServerConfigMock = mockGetIceServerConfig(null);
  getSignalingChannelEndpointsMock = mockGetSignalingChannelEndpoints(null);
});

afterEach(() => {
  getIceServerConfigMock.reset();
  getSignalingChannelEndpointsMock.reset();
  jest.clearAllMocks();
});

test("returns the local media stream", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.localMedia).toBeDefined();
});

test("stops the local media stream on cleanup", async () => {
  const mediaTrack = mockMediaTrack();
  const userMediaStream = mockUserMediaStream({
    mediaTracks: [mediaTrack as MediaStreamTrack],
  });
  mockMediaDevices({
    getUserMedia: mockGetUserMedia({ userMediaStream }),
  });
  const { waitForNextUpdate } = renderHook(() => useViewer(mockViewerConfig));
  await waitForNextUpdate();
  await cleanup();
  expect(mediaTrack.stop).toHaveBeenCalledTimes(1);
});

test("closes the signaling client on cleanup", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  await cleanup();
  expect(
    (result.current._signalingClient as SignalingClient).close
  ).toHaveBeenCalledTimes(1);
});

test("returns an RTC peer connection", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.peer?.connection).toBeDefined();
});

test("sends local media stream to the peer", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.peer?.connection?.addTrack).toHaveBeenCalledTimes(1);
});

test("returns the remote peer media stream", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.peer?.media).toBeDefined();
});

test("returns a local media stream error", async () => {
  const getUserMediaError = new Error();
  mockMediaDevices({
    getUserMedia: mockGetUserMedia({ error: getUserMediaError }),
  });
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(getUserMediaError);
});

test("returns a signaling channel endpoint error", async () => {
  const getSignalingChannelEndpointError = new Error();
  getSignalingChannelEndpointsMock = mockGetSignalingChannelEndpoints(
    getSignalingChannelEndpointError
  );
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(getSignalingChannelEndpointError);
});

test("returns an ice servers error", async () => {
  const getIceServerConfigError = new Error();
  getIceServerConfigMock = mockGetIceServerConfig(getIceServerConfigError);
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(getIceServerConfigError);
});

test("returns a signaling client error", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  const signalingClientError = new Error();
  act(() => {
    result.current._signalingClient?.emit("error", signalingClientError);
  });
  expect(result.current.error).toBe(signalingClientError);
});

test("sends local media stream to peer when it is ready", async () => {
  mockMediaDevices({
    getUserMedia: jest.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(mockUserMediaStream());
          }, 200)
        )
    ),
  });
  const { result, waitForNextUpdate } = renderHook(() =>
    useViewer(mockViewerConfig)
  );
  await waitForNextUpdate();
  await waitForNextUpdate();
  expect(result.current.peer?.connection?.addTrack).toHaveBeenCalledTimes(1);
});
