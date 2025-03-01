'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { ReactNode, useState } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

// Get the project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '687823e3ac560e9b79aa1e34dfa02502'

// Using the new simplified configuration API
const config = getDefaultConfig({
  appName: 'Base Colors',
  projectId,
  chains: [mainnet, base],
  // You can add custom chains with metadata if needed
  // chains: [
  //   {
  //     ...base,
  //     iconBackground: '#0052FF',
  //     iconUrl: 'https://example.com/base-logo.png',
  //   },
  // ],
  ssr: true,
})

interface RainbowKitWrapperProps {
  children: ReactNode
}

export default function RainbowKitWrapper({ children }: RainbowKitWrapperProps) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme()}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
} 