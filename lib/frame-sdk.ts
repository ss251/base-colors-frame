'use client';

import sdk from '@farcaster/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Define a type for our extended SDK
export interface ExtendedFrameSdk {
  getContext: () => Promise<Context.FrameContext>;
  closeFrame: () => Promise<void>;
  redirectToUrl: (url: string) => Promise<void>;
  isWalletConnected: () => Promise<boolean>;
  connectWallet: () => Promise<string[]>;
}

// Export the SDK wrapper with extended type
export const frameSdk: ExtendedFrameSdk = {
  getContext: async (): Promise<Context.FrameContext> => {
    try {
      const context = await sdk.context;
      await sdk.actions.ready({});
      return context;
    } catch (error) {
      console.error('Error getting frame context:', error);
      throw error;
    }
  },
  
  closeFrame: (): Promise<void> => {
    return sdk.actions.close();
  },
  
  redirectToUrl: (url: string): Promise<void> => {
    return sdk.actions.openUrl(url);
  },

  // Add a method to check wallet connection in the frame environment
  isWalletConnected: async (): Promise<boolean> => {
    try {
      // If we have access to the wallet provider, try to get accounts
      if (sdk.wallet && sdk.wallet.ethProvider) {
        const accounts = await sdk.wallet.ethProvider.request({
          method: 'eth_accounts',
        });
        
        return Array.isArray(accounts) && accounts.length > 0;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      return false;
    }
  },

  // Add a method to directly connect wallet in frames
  connectWallet: async (): Promise<string[]> => {
    try {
      if (!sdk.wallet || !sdk.wallet.ethProvider) {
        throw new Error('Wallet provider not available in frame');
      }

      const accounts = await sdk.wallet.ethProvider.request({
        method: 'eth_requestAccounts',
      });

      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      console.error('Error connecting wallet in frame:', error);
      return [];
    }
  }
}; 