import { SignalingClient } from "amazon-kinesis-video-streams-webrtc";

export function mockSignalingClient({
  open = () => null,
  close = () => null,
  sendIceCandidate = () => null,
  sendSdpAnswer = () => null,
} = {}): void {
  jest.spyOn(SignalingClient.prototype, "open").mockImplementation(open);
  jest.spyOn(SignalingClient.prototype, "close").mockImplementation(close);
  jest
    .spyOn(SignalingClient.prototype, "sendIceCandidate")
    .mockImplementation(sendIceCandidate);
  jest
    .spyOn(SignalingClient.prototype, "sendSdpAnswer")
    .mockImplementation(sendSdpAnswer);
}
