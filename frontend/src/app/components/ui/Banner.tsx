import type { ReactNode, SVGProps } from "react";
import styles from "./base.module.css";

export type BannerTone = "warning" | "error" | "info";

export type BannerProps = {
  tone: BannerTone;
  children: ReactNode;
};

const TONE_CLASS: Record<BannerTone, string> = {
  info: styles.bannerInfo,
  warning: styles.bannerWarning,
  error: styles.bannerError,
};

const ICON_PROPS: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

function BannerIcon({ tone }: { tone: BannerTone }) {
  if (tone === "warning") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M12 3l9.5 17h-19z" />
        <path d="M12 10v4" />
        <path d="M12 17.5v.01" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6" />
        <path d="M15 9l-6 6" />
      </svg>
    );
  }
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5v.01" />
    </svg>
  );
}

export function Banner({ tone, children }: BannerProps) {
  const role = tone === "info" ? "status" : "alert";

  return (
    <div role={role} className={`${styles.banner} ${TONE_CLASS[tone]}`}>
      <span className={styles.bannerIcon}>
        <BannerIcon tone={tone} />
      </span>
      <div className={styles.bannerBody}>{children}</div>
    </div>
  );
}

export default Banner;
