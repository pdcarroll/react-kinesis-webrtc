import { useEffect, useState } from "react";

/**
 * @description Opens and returns local media stream. Closes stream on cleanup.
 **/
export function useLocalMedia({
  audio = true,
  video = true,
}: {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
}): { error: Error | undefined; media: MediaStream | undefined } {
  const [media, setMedia] = useState<MediaStream>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then(setMedia)
      .catch(setError);
  }, [video, audio]);

  useEffect(() => {
    return function cleanup() {
      media?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    };
  }, [media]);

  return { error, media };
}
