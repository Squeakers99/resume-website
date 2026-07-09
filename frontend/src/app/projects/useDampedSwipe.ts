import { useRef, type PointerEvent, type RefObject } from "react";

type Options = {
  enabled: boolean;
  reduced: boolean;
  onCommit: (dir: 1 | -1) => void;
};

// Damped horizontal drag for the carousel and modal gallery: the surface
// follows the pointer at 0.4x once horizontal intent (8px) is established,
// then either commits a step (48px distance or 0.5px/ms velocity) or springs
// back. Vertical scrolling stays native via touch-action in CSS. The gesture
// is keyed to a single pointerId so a second finger can't corrupt it, and a
// browser-cancelled gesture aborts instead of committing.
export function useDampedSwipe(
  targetRef: RefObject<HTMLElement | null>,
  { enabled, reduced, onCommit }: Options
) {
  const state = useRef({
    active: false,
    intent: false,
    dragged: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
  });

  const resetTransform = (spring: boolean) => {
    const el = targetRef.current;
    if (!el) return;
    if (spring && !reduced) {
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "";
      const clear = () => {
        el.style.transition = "";
        el.removeEventListener("transitionend", clear);
      };
      el.addEventListener("transitionend", clear);
      setTimeout(clear, 250);
    } else {
      el.style.transition = "";
      el.style.transform = "";
    }
  };

  const abort = () => {
    const s = state.current;
    if (!s.active) return;
    const hadIntent = s.intent;
    s.active = false;
    s.pointerId = -1;
    if (hadIntent) {
      resetTransform(true);
      setTimeout(() => {
        s.dragged = false;
      }, 0);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const s = state.current;
    // One gesture at a time; a second touch must not reset the origin.
    if (s.active) return;
    s.active = true;
    s.intent = false;
    s.dragged = false;
    s.pointerId = e.pointerId;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
    s.velocity = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = state.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    // Mouse left the surface, released outside, came back: no buttons held
    // means the gesture is stale — drop it.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      abort();
      return;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.intent) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        s.intent = true;
        s.dragged = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10) {
        s.active = false;
        s.pointerId = -1;
        return;
      } else {
        return;
      }
    }
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) {
      s.velocity = (e.clientX - s.lastX) / dt;
      s.lastX = e.clientX;
      s.lastT = e.timeStamp;
    }
    const el = targetRef.current;
    if (el && !reduced) {
      el.style.transition = "none";
      el.style.transform = `translateX(${dx * 0.4}px)`;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const s = state.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    s.active = false;
    s.pointerId = -1;
    if (!s.intent) return;
    const dx = e.clientX - s.startX;
    const commit = Math.abs(dx) > 48 || Math.abs(s.velocity) > 0.5;
    resetTransform(!commit);
    if (commit) onCommit(dx < 0 ? 1 : -1);
    // Let the click that follows this pointerup see the drag flag, then clear.
    setTimeout(() => {
      s.dragged = false;
    }, 0);
  };

  const onPointerCancel = (e: PointerEvent) => {
    const s = state.current;
    if (e.pointerId !== s.pointerId) return;
    // Browser took the gesture (native scroll, system chrome): never commit.
    abort();
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    wasDragged: () => state.current.dragged,
  };
}
