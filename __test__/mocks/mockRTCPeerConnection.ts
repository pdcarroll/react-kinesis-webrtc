import { mockMediaTrack } from "./mockNavigator";

const mediaTrackMock = mockMediaTrack();

export interface MockRTCPeerConnection extends EventTarget {
  listeners?: { [key: string]: Array<(data?: unknown) => void> };
  addEventListener: (event: string, callback: (data: unknown) => void) => void;
  addTrack: jest.Mock;
  createAnswer: () => Promise<void>;
  createOffer: () => Promise<void>;
  iceConnectionState: RTCIceConnectionState;
  localDescription: {
    type: string;
    sdp: string;
  };
  setLocalDescription: (description: RTCSessionDescription) => void;
  setRemoteDescription: (description: RTCSessionDescription) => void;
}

type MockOptions = {
  RTCPeerConnection?: {
    setLocalDescription?: {
      error?: Error;
      response?: RTCSessionDescription;
    };
  };
};

export function mockRTCPeerConnection(options?: MockOptions): void {
  Object.defineProperty(global, "RTCIceCandidate", {
    value: class MockRTCIceCandidate {
      candidate = {
        toJSON: () => null,
      };
    },
    writable: true,
  });

  Object.defineProperty(global, "MediaStream", {
    value: class MockMediaStream {
      getTracks = () => [mediaTrackMock];
    },
    writable: true,
  });

  Object.defineProperty(global, "RTCPeerConnection", {
    value: class MockRTCPeerConnection extends EventTarget {
      private listeners: {
        [key: string]: Array<(data?: unknown) => void>;
      } = {};
      addEventListener = (
        event: string,
        callback: (data?: unknown) => void
      ) => {
        this.listeners[event]
          ? this.listeners[event].push(callback)
          : (this.listeners[event] = [callback]);
      };
      addTransceiver = jest.fn(() => null);
      addTrack = jest.fn().mockImplementation(() => {
        if (this.listeners.track) {
          this.listeners.track.forEach((callback) =>
            callback({ streams: [new MediaStream()] })
          );
        }
      });
      close = jest.fn();
      createAnswer = () =>
        Promise.resolve({
          sdp: "",
          type: "",
          toJSON: () => ({}),
        });
      createOffer: () => Promise<Partial<RTCSessionDescription>> = () =>
        Promise.resolve({
          type: "offer",
          sdp: "",
        });
      dispatchEvent = (event: Event) => {
        if (this.listeners[event.type]) {
          this.listeners[event.type].forEach((callback) => {
            callback(event);
          });
        }
        return event.cancelable;
      };
      getTransceivers = () => [{ direction: "" }];
      localDescription?: RTCSessionDescription;
      setLocalDescription = (description: RTCSessionDescription) =>
        new Promise((resolve, reject) => {
          if (options?.RTCPeerConnection?.setLocalDescription?.error) {
            return reject(options.RTCPeerConnection.setLocalDescription.error);
          }
          this.localDescription =
            options?.RTCPeerConnection?.setLocalDescription?.response ||
            description;
          return resolve(void 0);
        });
      setRemoteDescription = () => null;
    },
    writable: true,
  });
}
