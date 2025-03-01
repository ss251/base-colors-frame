import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WagmiProvider } from "./providers/WagmiProvider";
import NeynarProvider from "./providers/NeynarProvider";
import "@neynar/react/dist/style.css"; // Import Neynar styles

const inter = Inter({ subsets: ["latin"] });

// Generate metadata with frame support for Farcaster
export function generateMetadata(): Metadata {
  const url = process.env.NEXT_PUBLIC_BASE_URL || "https://bountycaster-basecolors.vercel.app";
  
  return {
    metadataBase: new URL(url),
    title: "Base Colors PFP Manager",
    description: "Change your Farcaster profile picture to any Base Colors you own",
    openGraph: {
      images: ["/base-colors-og.svg"],
      title: "Base Colors PFP Manager",
      description: "Change your Farcaster profile picture to any Base Colors you own",
    },
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
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WagmiProvider>
          <NeynarProvider>
            {children}
          </NeynarProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
