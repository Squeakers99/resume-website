"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbsFor } from "./nav";
import styles from "./Shell.module.css";

export default function Breadcrumbs() {
  const crumbs = breadcrumbsFor(usePathname());

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      <ol className={styles.breadcrumbList}>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${index}-${crumb.href}`}>
              {index > 0 ? (
                <li aria-hidden="true" className={styles.breadcrumbSeparator}>
                  /
                </li>
              ) : null}
              <li className={last ? styles.breadcrumbCurrent : undefined}>
                {last ? (
                  <span aria-current="page">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className={styles.breadcrumbLink}>
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
