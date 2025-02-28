'use client';

import { WagmiProvider as WagmiProviderRoot, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { frameConnector } from '../utils/farcasterConnector';
import { useState } from 'react';

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const config = createConfig({
    chains: [base],
    transports: {
      [base.id]: http(),
    },
    connectors: [
      frameConnector()
    ],
  });

  return (
    <WagmiProviderRoot config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProviderRoot>
  );
} 