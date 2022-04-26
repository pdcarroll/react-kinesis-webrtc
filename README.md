# React Kinesis WebRTC

An experimental library of React hooks for the AWS Kinesis WebRTC JavaScript SDK ([link](https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js)).

Provides a simple, declarative API that can handle peer-to-peer connections within React components.

**This library is still experimental and is therefore not yet suitable for production.**

## Examples

### Handle a media stream from a remote master peer:

```javascript
import React, { useEffect, useRef } from "react";
import { useViewer } from "react-kinesis-webrtc";

function Viewer() {
  const config = {
    credentials: {
      accessKeyId: "YOUR_AWS_ACCESS_KEY_ID",
      secretAccessKey: "YOUR_AWS_SECRET_ACCESS_KEY",
    },
    channelARN: "MASTER_SIGNALING_CHANNEL_ARN",
    region: "AWS_REGION",
    media: {
      audio: true,
      video: true,
    },
  };
  const {
    peer: { media },
  } = useViewer(config);

  const videoRef = useRef();

  // Handle the master peer media stream
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = media;
    }
  }, [media, videoRef]);

  return <video autoPlay ref={videoRef} />;
}
```

### Handle your local media stream:

```javascript
import React, { useEffect, useRef } from "react";
import { useMaster } from "react-kinesis-webrtc";

function Master() {
  const { error, localMediaSrc } = useMaster({
    credentials: {
      accessKeyId: "YOUR_AWS_ACCESS_KEY_ID",
      secretAccessKey: "YOUR_AWS_SECRET_ACCESS_KEY",
    },
    channelARN: "MASTER_SIGNALING_CHANNEL_ARN",
    region: "AWS_REGION",
    media: {
      audio: true,
      video: true,
    },
  });

  const localMediaRef = useRef();

  // Assign the local media stream to the video source
  useEffect(() => {
    if (localMediaRef.current) {
      localMediaRef.current.srcObject = localMediaSrc;
    }
  }, [localMediaSrc, localMediaRef]);

  // Display the local media stream
  return <video autoPlay ref={localMediaRef} />;
}
```

### Handle media streams from one or more remote viewer peers:

```javascript
import React, { useEffect, useRef } from "react";
import { useMaster } from "react-kinesis-webrtc";

function Peer({ mediaSrc }) {
  const ref = useRef();

  useEffect(() => {
    ref.current.srcObject = mediaSrc;
  }, [ref, mediaSrc]);

  return <video autoPlay ref={ref} />;
}

function Master() {
  const config = {
    credentials: {
      accessKeyId: "YOUR_AWS_ACCESS_KEY_ID",
      secretAccessKey: "YOUR_AWS_SECRET_ACCESS_KEY",
    },
    channelARN: "MASTER_SIGNALING_CHANNEL_ARN",
    region: "AWS_REGION",
    media: {
      audio: true,
      video: true,
    },
  };
  const { localMediaSrc, peers } = useMaster(config);

  // Display a Peer component for each remote peer stream
  return peers.map(({ id, mediaSrc }) => <Peer key={id} media={mediaSrc} />);
}
```

### Handle connection errors:

```javascript
import React, { useEffect, useRef } from "react";
import { useMaster } from "react-kinesis-webrtc";

function Master() {
  const { error } = useMaster(config);

  if (error) {
    return <p>An error occurred: {error.message}</p>;
  }
}
```

## API

### useMaster

Establishes a master connection using an existing signaling channel. Manages peer connections and returns media streams for each peer.

#### Params:

- config - `Object`:

```typescript
{
  credentials: {
    accessKeyId: string; // AWS access key ID
    secretAccessKey: string; // AWS secret access key
  },
  channelARN: string; // An active AWS signaling channel ARN
  region: "" // The AWS region of the channel ARN
  media: {
    audio: boolean; // stream audio
    video: boolean | MediaStreamConstraints; // stream video or video options
  }
}
```

#### Return Value:

```typescript
{
  error: Error | undefined,
  localMedia: MediaStream | undefined, // Your local media stream
  peers: Array<Peer> // Remote viewer peer media streams
}
```

#### Peer Entity:

```typescript
{
  id: string;
  connection: RTCPeerConnection;
  media: MediaStream;
}
```

### useViewer

Establishes a viewer connection to an existing, active signaling channel.

#### Params

- config - `Object`:

```typescript
{
  credentials: {
    accessKeyId: string; // AWS access key ID
    secretAccessKey: string; // AWS secret access key
  },
  channelARN: string; // An active master AWS signaling channel ARN
  region: string; // The AWS region of the channel ARN
  media: { // Media options
    audio: boolean;
    video: boolean | MediaTrackConstraints;
  }
}
```

#### Return Value

```typescript
{
  error: Error | undefined,
  localMedia: MediaStream | undefined // Your local media stream
  peer: Peer // The remote master peer
}
```

## Debugging

To view debug logs, you can pass the `debug` option to `useMaster` or `useViewer`:

```typescript
useMaster({ ...config, debug: true });
```

