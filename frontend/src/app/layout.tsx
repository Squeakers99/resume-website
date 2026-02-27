import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soheil Rajabali | Portfolio",
  description: "Portfolio website for Soheil Rajabali, mechatronics engineer and software developer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="site-header" aria-label="Primary site navigation">
          <div className="site-header-inner">
            <div className="brand">
              <img className="brand-logo" src="/logo.png" alt="Soheil Rajabali logo" />
              <span className="brand-name">SOHEIL RAJABALI</span>
            </div>

            <nav aria-label="Main navigation">
              <ul className="nav-list">
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li>
                  <Link href="/projects">Projects</Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>

        <div className="site-main">{children}</div>
      </body>
    </html>
  );
}
