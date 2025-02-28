'use client';

import { useEffect, useState } from 'react';
import { frameSdk } from '@/lib/frame-sdk';
import ColorFrame from './components/ColorFrame';
import { Context } from '@farcaster/frame-sdk';

export default function Home() {
  const [context, setContext] = useState<Context.FrameContext | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        const ctx = await frameSdk.getContext();
        setContext(ctx);
      } catch (e) {
        console.error('Error fetching frame context:', e);
      }
    };

    fetchContext();
  }, []);

  // Check if we're in a frame
  const isInFrame = !!context?.user?.fid;

  if (!isInFrame) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-blue-900 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold mb-4">Base Colors PFP Manager</h1>
          <p className="mb-6">
            This app allows you to set any Base Colors you own as your Farcaster profile picture.
          </p>
          <div className="p-4 bg-blue-800 rounded-lg mb-6">
            <p className="text-sm">
              Please open this app in a Farcaster client like Warpcast to use it.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
            {Array.from({ length: 9 }).map((_, i) => (
              <div 
                key={i} 
                className="w-12 h-12 rounded-md" 
                style={{ 
                  backgroundColor: [
                    '#FF5733', '#33FF57', '#3357FF',
                    '#FF33A8', '#A833FF', '#33FFF6',
                    '#F6FF33', '#FF8333', '#33FFBD'
                  ][i] 
                }}
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-4 bg-blue-900 text-white">
      <ColorFrame context={context} />
    </main>
  );
}
