import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Announces `text` to screen readers when it changes, at most once per `throttleMs` (the latest
 * text wins). `accessibilityLiveRegion` does nothing on iOS and repeats on Android, so live
 * regions here are announced explicitly on both platforms.
 */
export function useAnnounce(text: string | null | undefined, throttleMs = 1000): void {
  const last = useRef<string | null>(null);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text || text === last.current) return undefined;
    const send = () => {
      last.current = text;
      lastAt.current = Date.now();
      AccessibilityInfo.announceForAccessibility(text);
    };
    const wait = lastAt.current + throttleMs - Date.now();
    if (wait <= 0) {
      send();
      return undefined;
    }
    timer.current = setTimeout(send, wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, throttleMs]);
}
