'use client';

import sdk from '@farcaster/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Add this type declaration at the top of the file
declare global {
  interface Window {
    ethereum?: {
      request: (args: { 
        method: string; 
        params?: unknown[]
      }) => Promise<unknown>;
    };
  }
}

// Define a type for our extended SDK
export interface ExtendedFrameSdk {
  getContext: () => Promise<Context.FrameContext>;
  closeFrame: () => Promise<void>;
  redirectToUrl: (url: string) => Promise<void>;
  isWalletConnected: () => Promise<boolean>;
  connectWallet: () => Promise<string[]>;
  signMessage: (options: { message: string }) => Promise<string>;
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
  },

  signMessage: async (options: { message: string }): Promise<string> => {
    try {
      // Check if we're in a Farcaster frame context
      if (typeof window === 'undefined' || !window.parent) {
        throw new Error('Not in a frame context');
      }
      
      // For frame context, use Ethereum personal_sign
      // This is a mock implementation - in a real frame this would interact with the frame
      console.log('Attempting to sign message in frame context:', options.message);
      
      // In a real frame, this would be handled by the frame provider
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        }) as string[];
        
        if (accounts.length === 0) {
          throw new Error('No accounts available to sign');
        }
        
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [options.message, accounts[0]],
        }) as string;
        
        return signature;
      } else {
        throw new Error('No Ethereum provider available for signing');
      }
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  }
}; 