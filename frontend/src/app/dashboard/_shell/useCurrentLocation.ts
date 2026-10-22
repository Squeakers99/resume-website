"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

type NavigationLike = EventTarget;

// next/link moves between `/dashboard#x` hashes with history.pushState, which
// does not fire `hashchange`. So besides hashchange/popstate, listen to the
// Navigation API where available, and re-check shortly after any click as a
// fallback. Extra notifications are cheap: React only re-renders when the
// snapshot actually changes.
function subscribe(onChange: () => void) {
  const navigation = (window as Window & { navigation?: NavigationLike }).navigation;
  const timers = new Set<number>();
  const onClick = () => {
    for (const delay of [0, 100]) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        onChange();
      }, delay);
      timers.add(id);
    }
  };
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  document.addEventListener("click", onClick, true);
  navigation?.addEventListener("currententrychange", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    document.removeEventListener("click", onClick, true);
    navigation?.removeEventListener("currententrychange", onChange);
    timers.forEach((id) => window.clearTimeout(id));
  };
}

const readHash = () => window.location.hash;

// The server has no hash, so the first client render matches the SSR markup;
// the real hash applies right after hydration.
export function useCurrentLocation(): { pathname: string; hash: string } {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  return { pathname, hash };
}
