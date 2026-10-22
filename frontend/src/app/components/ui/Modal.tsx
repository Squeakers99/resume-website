"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./interactive.module.css";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** "center" (default) is a centered dialog; "sheet" anchors to the bottom edge. */
  variant?: "center" | "sheet";
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/* Open modals, innermost last. Only the topmost one handles keys and focus,
   and the body scroll lock is released when the last one closes. */
const openStack: object[] = [];
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest("[inert]") &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.getClientRects().length > 0,
  );
}

function lockBodyScroll() {
  const { body, documentElement } = document;
  savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  // Keep the layout from shifting when the page scrollbar disappears.
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbarWidth}px`;
  }
  body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  if (!savedBodyStyle) return;
  document.body.style.overflow = savedBodyStyle.overflow;
  document.body.style.paddingRight = savedBodyStyle.paddingRight;
  savedBodyStyle = null;
}

const subscribeNoop = () => () => {};

export function Modal({ open, onClose, title, children, footer, variant = "center" }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerDownOnOverlay = useRef(false);
  // document.body only exists on the client; render nothing during SSR and hydration.
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open || !isClient) return;
    const panel = panelRef.current;
    if (!panel) return;

    const token = {};
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isTopmost = () => openStack[openStack.length - 1] === token;

    openStack.push(token);
    if (openStack.length === 1) lockBodyScroll();

    // Respect a child that already took focus (autoFocus); otherwise focus the
    // dialog itself so its name is announced and Tab starts at the first control.
    if (!panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || active === panel || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Pull focus back if it lands outside the dialog by any other route.
    const onFocusIn = (event: FocusEvent) => {
      if (!isTopmost()) return;
      if (event.target instanceof Node && !panel.contains(event.target)) {
        (getFocusable(panel)[0] ?? panel).focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      const index = openStack.indexOf(token);
      if (index !== -1) openStack.splice(index, 1);
      if (openStack.length === 0) unlockBodyScroll();
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, isClient]);

  if (!open || !isClient) return null;

  // Close only when the press both starts and ends on the backdrop, so a text
  // selection dragged out of the panel does not dismiss the dialog.
  const onOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    pointerDownOnOverlay.current = event.target === event.currentTarget;
  };
  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    const startedOnOverlay = pointerDownOnOverlay.current;
    pointerDownOnOverlay.current = false;
    if (startedOnOverlay && event.target === event.currentTarget) onClose();
  };

  const isSheet = variant === "sheet";

  return createPortal(
    <div
      className={`${styles.overlay} ${isSheet ? styles.overlaySheet : ""}`}
      onMouseDown={onOverlayMouseDown}
      onClick={onOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${styles.panel} ${isSheet ? styles.panelSheet : ""}`}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
