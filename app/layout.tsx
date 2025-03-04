import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WagmiProvider } from "./providers/WagmiProvider";
import NeynarProvider from "./providers/NeynarProvider";
import "@neynar/react/dist/style.css"; // Import Neynar styles

const inter = Inter({ subsets: ["latin"] });

// Generate metadata with frame support for Farcaster
export function generateMetadata(): Metadata {
  const url = process.env.NEXT_PUBLIC_BASE_URL || "https://color-pfps.vercel.app";
  
  return {
    metadataBase: new URL(url),
    title: "color pfps",
    description: "Change your Farcaster profile picture to any Base Colors you own",
    openGraph: {
      images: [`${url}/basecolors_logo.png`],
      title: "color pfps",
      description: "Change your Farcaster profile picture to any Base Colors you own",
    },
    icons: {
      icon: `${url}/basecolors_logo.png`,
      apple: `${url}/basecolors_logo.png`,
    },
    other: {
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: `${url}/basecolors_logo.png`,
        button: {
          title: "Set Base Colors PFP",
          action: {
            type: "launch_frame",
            name: "color pfps",
            url: url,
            splashImageUrl: `${url}/basecolors_logo.png`,
            splashBackgroundColor: "#0F2352",
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
