import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/app/components/navbar/Navbar";
import ThemeToggle from "@/app/components/ThemeToggle";
import "./globals.css";

const description = 
  "Hi, I'm Soheil Rajabali. This is my portfolio website where I share my projects and experience in mechatronics engineering and software development.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://soheilrajabali.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/site.webmanifest",
  icons: {
    icon: "/Logo.png",
    shortcut: "/Logo.png",
    apple: "/Logo.png",
  },
  title: {
    default: "Soheil Rajabali | Mechatronics Engineer",
    template: "%s | Soheil Rajabali",
  },
  description:
    description,
  keywords: [
    "Soheil Rajabali",
    "Soheil",
    "Soheil Rajabali portfolio",
    "Mechatronics Engineer",
    "Soheil Rajabali U of A",
    "Soheil Rajabali Robotics",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Soheil Rajabali | Mechatronics Engineer",
    description:
      description,
    siteName: "Soheil Rajabali Portfolio",
    images: [
      {
        url: "/Logo.png",
        width: 1200,
        height: 630,
        alt: "Soheil Rajabali portfolio logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Soheil Rajabali | Mechatronics Engineer",
    description:
      description,
    images: ["/Logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();
  const formattedCommits =
    typeof gitMeta.commitCount === "number"
      ? new Intl.NumberFormat("en-US").format(gitMeta.commitCount)
      : "--";
  const personStructuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Soheil Rajabali",
    url: siteUrl,
    image: `${siteUrl}/Logo.png`,
    jobTitle: "Mechatronics Engineer and Software Developer",
    sameAs: [
      "https://github.com/Squeakers99",
      "https://www.linkedin.com/in/soheilrajabali/",
      "https://www.instagram.com/soheil.rajabali/",
    ],
  };
  const siteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Soheil Rajabali Portfolio",
    url: siteUrl,
  };
  const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Soheil Rajabali",
    url: siteUrl,
    logo: `${siteUrl}/Logo.png`,
    sameAs: [
      "https://github.com/Squeakers99",
      "https://www.linkedin.com/in/soheilrajabali/",
      "https://www.instagram.com/soheil.rajabali/",
    ],
  };

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personStructuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationStructuredData) }}
        />
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
