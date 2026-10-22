"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiLogOut } from "react-icons/fi";
import ThemeToggle from "@/app/components/ThemeToggle";
import { Modal } from "@/app/components/ui";
import { MORE_ITEMS, isActive } from "./nav";
import styles from "./Shell.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  email: string;
  signOutAction: () => Promise<void>;
};

export default function MoreSheet({ open, onClose, email, signOutAction }: Props) {
  const pathname = usePathname();

  return (
    <Modal open={open} onClose={onClose} title="More" variant="sheet">
      <div className={styles.moreSheet}>
        <nav aria-label="More sections">
          <ul className={styles.moreList}>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item, pathname);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`${styles.moreLink} ${active ? styles.navLinkActive : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                  >
                    <Icon className={styles.navIcon} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.moreSection}>
          <span className={styles.moreSectionLabel}>Theme</span>
          <ThemeToggle />
        </div>
        <div className={styles.moreAccount}>
          <span className={styles.userEmail} title={email}>
            {email}
          </span>
          <form action={signOutAction}>
            <button type="submit" className={styles.signOutButton}>
              <FiLogOut aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
