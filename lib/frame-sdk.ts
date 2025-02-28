'use client';

import sdk from '@farcaster/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Export the SDK wrapper
export const frameSdk = {
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
  }
}; 