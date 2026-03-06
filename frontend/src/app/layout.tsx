import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/app/components/navbar/Navbar";
import ThemeToggle from "@/app/components/ThemeToggle";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Navbar />

        <div className="site-main">{children}</div>

        <footer className="site-footer" aria-label="Site footer">
          <div className="site-footer-inner">
            <div className="footer-left">
              <span className="footer-item">&#169; {year} Soheil Rajabali</span>
            </div>
            <div className="footer-right">
              <div className="footer-theme">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
