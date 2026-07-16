import { useState, useEffect } from 'react';

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let isFirstPass = true;
    const sceneKeys = Object.keys(durations);
    const totalScenes = sceneKeys.length;

    const playScene = (index: number) => {
      if (index === 0 && isFirstPass) {
        window.startRecording?.();
      }
      
      setCurrentScene(index);
      
      const duration = durations[sceneKeys[index]];
      timeout = setTimeout(() => {
        if (index === totalScenes - 1) {
          if (isFirstPass) {
            window.stopRecording?.();
            isFirstPass = false;
          }
          playScene(0); // loop back
        } else {
          playScene(index + 1);
        }
      }, duration);
    };

    playScene(0);

    return () => clearTimeout(timeout);
  }, []); // Only run once on mount

  return { currentScene };
}
