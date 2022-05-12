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
import * as config from "../../__test__/fixtures/config.json";
import {
  mockMediaDevices,
  mockGetUserMedia,
  mockMediaTrack,
  mockUserMediaStream,
} from "../../__test__/mocks/mockNavigator";
import { mockGetSignalingChannelEndpoints } from "../../__test__/mocks/mockKinesisVideo";
import { mockGetIceServerConfig } from "../../__test__/mocks/mockKinesisVideoSignalingClient";
import {
  mockRTCPeerConnection,
  MockRTCPeerConnection,
} from "../../__test__/mocks/mockRTCPeerConnection";
import { mockSignalingClient } from "../../__test__/mocks/mockSignalingClient";
import { useMaster } from "./useMaster";
import { randomUUID } from "crypto";

const masterConfig = {
  ...config,
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

function mockNewPeerConnection(
  signalingClient: SignalingClient,
  peerId = randomUUID()
): string {
  act(() => {
    signalingClient.emit("sdpOffer", {}, peerId);
  });
  return peerId;
}

function mockPeerDisconnect(peerConnection: RTCPeerConnection) {
  act(() => {
    // @ts-expect-error - MockRTCPeerConnection
    (peerConnection as MockRTCPeerConnection).iceConnectionState =
      "disconnected";
    peerConnection.dispatchEvent(new Event("iceconnectionstatechange"));
  });
}

function mockSignalingClientOpen(signalingClient: SignalingClient) {
  act(() => {
    signalingClient?.emit("open");
  });
}

function mockSignalingClientError(signalingClient: SignalingClient) {
  act(() => {
    signalingClient.emit("error", new Error());
  });
}

function mockMediaDevicesWithDelay(delay = 200) {
  return mockMediaDevices({
    getUserMedia: jest.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(mockUserMediaStream());
          }, delay)
        )
    ),
  });
}

test("opens the signaling client", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  expect(
    (result.current._signalingClient as SignalingClient).open
  ).toHaveBeenCalledTimes(1);
});

test("toggles isOpen when signaling client opens", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockSignalingClientOpen(result.current._signalingClient as SignalingClient);
  expect(result.current.isOpen).toBe(true);
});

test("closes the signaling client on cleanup", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  await cleanup();
  expect(
    (result.current._signalingClient as SignalingClient).close
  ).toHaveBeenCalledTimes(1);
});

test("returns the local media stream", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
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
  const { waitForNextUpdate } = renderHook(() => useMaster(masterConfig));
  await waitForNextUpdate();
  await cleanup();
  expect(mediaTrack.stop).toHaveBeenCalledTimes(1);
});

test("returns a list of connected peers", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  const peerId = mockNewPeerConnection(
    result.current._signalingClient as SignalingClient
  );
  expect(result.current.peers).toHaveLength(1);
  expect(result.current.peers[0].id).toBe(peerId);
});

test("sends local media stream to a new peer", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockNewPeerConnection(result.current._signalingClient as SignalingClient);
  expect(result.current.peers[0].connection?.addTrack).toHaveBeenCalledTimes(1);
});

test("receives media from a peer", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockNewPeerConnection(result.current._signalingClient as SignalingClient);
  expect(result.current.peers[0].media).toBeDefined();
});

test("removes a peer when the peer disconnects", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockNewPeerConnection(result.current._signalingClient as SignalingClient);
  mockPeerDisconnect(result.current.peers[0].connection as RTCPeerConnection);
  expect(result.current.peers).toHaveLength(0);
});

test("handles a peer re-connection", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  const peerId = randomUUID();
  mockNewPeerConnection(
    result.current._signalingClient as SignalingClient,
    peerId
  );
  mockPeerDisconnect(result.current.peers[0].connection as RTCPeerConnection);
  mockNewPeerConnection(
    result.current._signalingClient as SignalingClient,
    peerId
  );
  expect(result.current.peers).toHaveLength(1);
});

test("handles multiple peer connections", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  new Array(3)
    .fill(null)
    .forEach(() =>
      mockNewPeerConnection(result.current._signalingClient as SignalingClient)
    );
  expect(result.current.peers).toHaveLength(3);
  result.current.peers.forEach((peer) => {
    expect(peer.connection?.addTrack).toHaveBeenCalledTimes(1);
    expect(peer.media).toBeDefined();
  });
  result.current.peers.forEach((peer) => {
    mockPeerDisconnect(peer.connection as RTCPeerConnection);
  });
  expect(result.current.peers).toHaveLength(0);
});

test("removes peers when there is a signaling client error", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockNewPeerConnection(result.current._signalingClient as SignalingClient);
  mockNewPeerConnection(result.current._signalingClient as SignalingClient);
  mockSignalingClientError(result.current._signalingClient as SignalingClient);
  expect(result.current.peers).toHaveLength(0);
});

test("does not open the signaling client until the local media stream is created", async () => {
  mockMediaDevicesWithDelay();
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  expect(result.current._signalingClient?.open).toHaveBeenCalledTimes(0);
});

test("cancels the local media stream when there is an error", async () => {
  mockMediaDevicesWithDelay();
  const { result, waitForNextUpdate } = renderHook(() =>
    useMaster(masterConfig)
  );
  await waitForNextUpdate();
  mockSignalingClientError(result.current._signalingClient as SignalingClient);
  expect(result.current.localMedia).toBeUndefined();
});
