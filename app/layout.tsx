import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WagmiProvider } from "./providers/WagmiProvider";

const inter = Inter({ subsets: ["latin"] });

// Frame metadata for Farcaster
export function generateFrameMetadata(): Metadata {
  const url = process.env.NEXT_PUBLIC_BASE_URL || "https://bountycaster-basecolors.vercel.app";
  
  return {
    metadataBase: new URL(url),
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: `${url}/base-colors-og.svg`,
        button: {
          title: "Set Base Colors PFP",
          action: {
            type: "launch_frame",
            name: "Base Colors PFP",
            url: url,
            splashImageUrl: `${url}/splash.svg`,
            splashBackgroundColor: "#1E40AF",
          },
        },
      }),
    },
    openGraph: {
      images: ["/base-colors-og.svg"],
      title: "Base Colors PFP Manager",
      description: "Change your Farcaster profile picture to any Base Colors you own",
    },
  };
}

export const metadata = generateFrameMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WagmiProvider>
          {children}
        </WagmiProvider>
      </body>
    </html>
  );
}
