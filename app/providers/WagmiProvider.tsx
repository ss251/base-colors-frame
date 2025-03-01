'use client';

import { WagmiProvider as WagmiProviderRoot, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { frameConnector } from '../utils/farcasterConnector';
import { useState, useEffect } from 'react';

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [isFrameEnvironment, setIsFrameEnvironment] = useState(false);

  // Check if we're in a frame environment
  useEffect(() => {
    const checkFrameEnvironment = async () => {
      try {
        // Attempt to detect Farcaster frame environment
        const frameSDK = await import('@farcaster/frame-sdk');
        if (frameSDK && frameSDK.default) {
          const context = await frameSDK.default.context;
          setIsFrameEnvironment(!!context);
          console.log('Frame environment detected:', !!context);
        }
      } catch (error) {
        console.warn('Error detecting frame environment:', error);
        setIsFrameEnvironment(false);
      }
    };

    checkFrameEnvironment();
  }, []);

  // Configure Wagmi with the frameConnector
  const config = createConfig({
    chains: [base],
    transports: {
      [base.id]: http(),
    },
    // Only use frameConnector in frame environment, otherwise use an empty array
    // This prevents errors when not in a Farcaster frame
    connectors: isFrameEnvironment ? [frameConnector()] : [],
  });

  return (
    <WagmiProviderRoot config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProviderRoot>
  );
} 