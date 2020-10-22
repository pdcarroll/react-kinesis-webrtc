# React Kinesis WebRTC

React hooks for [AWS Kinesis WebRTC JavaScript SDK](https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js).

## API

### useMaster(config)

Establishes a master connection using an existing signaling channel. Manages peer connections and returns media streams for each peer.

#### Parameters

- config - `Object`

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

#### Return Value

```typescript
{
  error: Error | undefined,
  localMediaSrc: MediaStream | undefined, // Your local media stream
  peerMediaSrcMap: Map<string, MediaStream> // A map of remote viewer peer media streams (item key is the user's unique ID)
}
```

### useViewer(config)

Establishes a viewer connection to an existing, active signaling channel.

#### Parameters

- config - `Object`

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
  localMediaSrc: MediaStream | undefined // Your local media stream
  peerMediaSrc: MediaStream | undefined // The remote master peer media stream
}
```

## Examples

### Media stream from a remote master peer:

```javascript
import React, { useEffect, useRef } from "react";
import { useViewer } from "react-kinesis-webrtc";

function Viewer() {
  const { peerMediaSrc } = useViewer({
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

  const videoRef = useRef();

  // Handle the master peer media stream
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = peerMediaSrc;
    }
  }, [peerMediaSrc, videoRef]);

  return <video autoPlay ref={videoRef} />;
}
```

### Local media stream:

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

### Media streams from one or more remote viewer peers:

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
  const { localMediaSrc, peerMediaSrcMap } = useMaster({
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

  // Display a Peer component for each remote peer stream
  return [...peerMediaSrcMap.entries()].map(([id, mediaSrc]) => (
    <Peer key={id} media={mediaSrc} />
  ));
}
```

### Connection errors:

```javascript
import React, { useEffect, useRef } from "react";
import { useMaster } from "react-kinesis-webrtc";

function Master() {
  const { error } = useMaster(/* ... */);

  if (error) {
    return <p>An error occurred: {error.message}</p>;
  }
}
```
