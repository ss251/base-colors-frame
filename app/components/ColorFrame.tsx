'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import QRCode from 'react-qr-code';
import toast, { Toaster } from 'react-hot-toast';
import frameSdkOriginal, { Context } from '@farcaster/frame-sdk';
import { useAccount, useConnect } from 'wagmi';
import { useNeynarContext, NeynarAuthButton, SIWN_variant } from '@neynar/react';

import { fetchOwnedBaseColors, generateColorSvg, BaseColor } from '../utils/baseColors';
import { frameSdk, ExtendedFrameSdk } from '@/lib/frame-sdk';
// import { scheduleProfileUpdates } from '../utils/baseColors'; // Will be used when auto-cycle is implemented

// Type declaration for the global window object
declare global {
  interface Window {
    onNeynarSignInSuccess: (data: NeynarSignInData) => void;
  }
}

// Define the Neynar sign-in response type
interface NeynarSignInData {
  signer_uuid: string;
  user: {
    username: string;
    fid: number;
  };
}

// State atoms for user data
const neynarSignerUuidAtom = atom<string | null>(null);

interface ColorFrameProps {
  context?: Context.FrameContext;
}

export default function ColorFrame({ context }: ColorFrameProps) {
  // Use the Neynar context directly - make sure we only use properties that exist
  const { user, isAuthenticated } = useNeynarContext();
  const [ownedColors, setOwnedColors] = useState<BaseColor[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedColorName, setSelectedColorName] = useState<string | null>(null);
  // We need deepLinkUrl for QR code functionality
  const deepLinkUrlState = useState<string | null>(null);
  const deepLinkUrl = deepLinkUrlState[0];
  const [loading, setLoading] = useState<boolean>(false);
  // Track the current profile picture URL to delete it when updating
  const [currentProfilePictureUrl, setCurrentProfilePictureUrl] = useState<string | null>(null);
  // Add a flag to prevent duplicate profile picture fetches
  const [isFetchingProfile, setIsFetchingProfile] = useState<boolean>(false);
  // Reference to store the profile toast ID
  const profileToastIdRef = useRef<string | null>(null);
  // Add a ref to track if we've already fetched the profile this session
  const hasProfileFetchedRef = useRef<boolean>(false);

  // Auto-cycle feature temporarily disabled - will implement later
  // const [selectedInterval, setSelectedInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // const [autoCycleEnabled, setAutoCycleEnabled] = useState<boolean>(false);

  // Store the signer UUID for API calls
  const [, setNeynarSignerUuid] = useAtom(neynarSignerUuidAtom);
  const [fetchingNFTs, setFetchingNFTs] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasFetchedColors, setHasFetchedColors] = useState<boolean>(false);
  
  // Access wagmi hooks for wallet connection
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  // Add a ref to track auth timeout
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create function to track authentication process
  const startAuthTimeout = () => {
    // Clear any existing timeout
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
    }
    
    // Set a new timeout to show a message if auth takes too long
    authTimeoutRef.current = setTimeout(() => {
      if (!isAuthenticated) {
        toast.error("Authentication is taking longer than expected. Please try again.");
        console.log("Authentication timeout reached");
      }
      authTimeoutRef.current = null;
    }, 30000); // 30 second timeout
  };

  // Clear timeout on component unmount
  useEffect(() => {
    return () => {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
    };
  }, []);

  // Track when authentication state changes
  useEffect(() => {
    // If we become authenticated and have a timeout running, clear it
    if (isAuthenticated && authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
      toast.success("Connected to Farcaster!");
    }
  }, [isAuthenticated]);

  // Use signer UUID from Neynar context if available
  useEffect(() => {
    if (isAuthenticated && user?.signer_uuid && !isFetchingProfile && !hasProfileFetchedRef.current) {
      console.log('Setting signer UUID from Neynar context:', user.signer_uuid);
      setNeynarSignerUuid(user.signer_uuid);
      
      // Fetch the user's current profile picture URL if we have an FID
      if (user.fid) {
        fetchUserProfilePicture(user.fid);
      }
    }
  }, [isAuthenticated, user?.signer_uuid, user?.fid]);

  // Check if we're in a Farcaster frame
  const isInFrame = useMemo(() => {
    return !!context?.user?.fid;
  }, [context]);

  // Use frame-specific wallet detection
  useEffect(() => {
    if (isInFrame && !isConnected) {
      // Check if wallet is already connected via frameSdk
      const checkFrameWallet = async () => {
        try {
          // Use the properly typed SDK
          const isConnectedInFrame = await (frameSdk as ExtendedFrameSdk).isWalletConnected();
          console.log('Frame wallet connection check:', isConnectedInFrame);
          
          if (isConnectedInFrame) {
            // If connected in frame but not detected by wagmi, manually connect
            const farcasterConnector = connectors.find(c => c.id === 'farcaster');
            if (farcasterConnector) {
              connect({ connector: farcasterConnector });
            }
          }
        } catch (error) {
          console.error('Error checking frame wallet connection:', error);
        }
      };
      
      checkFrameWallet();
    }
  }, [isInFrame, isConnected, connectors, connect]);
  
  // Function to connect wallet - simplified implementation without mock data
  const connectWallet = async () => {
    try {
      // Check if we're in a Farcaster frame
      if (!isInFrame) {
        toast.error("This feature is only available in a Farcaster frame");
        return;
      }

      // Try to connect to the wallet using wagmi hooks
      if (!isConnected) {
        const toastId = toast.loading("Connecting to wallet...");
        try {
          // Try frame-specific connection first
          const accounts = await (frameSdk as ExtendedFrameSdk).connectWallet();
          
          if (accounts.length > 0) {
            // If we got accounts from the frame, connect using the connector
            const farcasterConnector = connectors.find(c => c.id === 'farcaster');
            if (farcasterConnector) {
              connect({ connector: farcasterConnector });
              toast.dismiss(toastId);
              toast.success("Wallet connection initiated");
              return;
            }
          }
          
          // Connect wallet using the first available connector as fallback
          if (connectors[0]) {
            connect({ connector: connectors[0] });
            toast.dismiss(toastId);
            toast.success("Wallet connection initiated");
          } else {
            toast.dismiss(toastId);
            throw new Error("No wallet connectors available");
          }
        } catch (walletError) {
          console.error("Error connecting wallet:", walletError);
          toast.dismiss(toastId);
          toast.error(`Wallet connection failed: ${walletError instanceof Error ? walletError.message : 'Unknown error'}`);
        }
      } else {
        // We already have a connected wallet
        toast.success(`Wallet connected: ${address?.slice(0, 6)}...${address?.slice(-4)}`);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    }
  };
  
  // Track active toast IDs for proper cleanup
  const fetchToastIdRef = useRef<string | null>(null);
  
  // Fetch owned Base Colors when wallet is connected - simplified implementation
  useEffect(() => {
    // Clear flags when address changes to ensure refetch
    if (address) {
      setHasFetchedColors(false);
    }
  }, [address]);

  useEffect(() => {
    // Only run if we have an address, are connected, haven't fetched yet and aren't currently fetching
    if (!address || !isConnected || hasFetchedColors || fetchingNFTs) {
      return;
    }

    console.log('Initiating color fetch for address:', address);
    
    const fetchColors = async () => {
      // Dismiss any existing toasts
      if (fetchToastIdRef.current) {
        toast.dismiss(fetchToastIdRef.current);
        fetchToastIdRef.current = null;
      }
      
      // Set loading state
      setFetchingNFTs(true);

      // Show loading toast
      const toastId = toast.loading('Fetching your Base Colors...');
      fetchToastIdRef.current = toastId;

      try {
        // Set timeout for fetch operation
        const fetchWithTimeout = new Promise<BaseColor[]>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Fetch operation timed out'));
          }, 15000); // 15 second timeout

          fetchOwnedBaseColors(address)
            .then(colors => {
              clearTimeout(timeoutId);
              resolve(colors);
            })
            .catch(error => {
              clearTimeout(timeoutId);
              reject(error);
            });
        });

        // Await the fetch with timeout
        const colors = await fetchWithTimeout;
        
        if (colors.length > 0) {
          setOwnedColors(colors);
          setSelectedColor(colors[0].colorValue);
          setSelectedColorName(colors[0].name);
          toast.success(`Found ${colors.length} Base Colors`);
        } else {
          console.log('No Base Colors found');
          setOwnedColors([]);
        }
      } catch (error) {
        console.error('Failed to fetch colors:', error);
        toast.error('Failed to fetch Base Colors');
        setOwnedColors([]);
      } finally {
        // Always clean up
        if (fetchToastIdRef.current) {
          toast.dismiss(fetchToastIdRef.current);
          fetchToastIdRef.current = null;
        }
        setFetchingNFTs(false);
        setHasFetchedColors(true);
      }
    };

    fetchColors();
  }, [address, isConnected, hasFetchedColors, fetchingNFTs]);

  // Function to fetch the current profile picture URL
  const fetchUserProfilePicture = async (fid: number) => {
    // Return early if already fetching or if we've already fetched successfully
    if (isFetchingProfile || hasProfileFetchedRef.current) {
      console.log('Already fetching profile or profile already fetched, skipping duplicate call');
      return;
    }

    setIsFetchingProfile(true);
    
    // Clear any existing toast
    if (profileToastIdRef.current) {
      toast.dismiss(profileToastIdRef.current);
      profileToastIdRef.current = null;
    }
    
    try {
      const toastId = toast.loading("Fetching current profile...");
      profileToastIdRef.current = toastId;
      
      // Call the Neynar API to get the user profile
      const response = await fetch(`/api/get-user-profile?fid=${fid}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const data = await response.json();
      
      if (data.user && data.user.pfp_url) {
        console.log('Current profile picture URL:', data.user.pfp_url);
        setCurrentProfilePictureUrl(data.user.pfp_url);
        // Mark as successfully fetched
        hasProfileFetchedRef.current = true;
      }
      
      toast.dismiss(toastId);
      profileToastIdRef.current = null;
    } catch (error) {
      console.error('Error fetching profile picture:', error);
      // Dismiss any active toast
      if (profileToastIdRef.current) {
        toast.dismiss(profileToastIdRef.current);
        profileToastIdRef.current = null;
      }
    } finally {
      setIsFetchingProfile(false);
    }
  };

  // Function to update profile picture using Neynar
  const updateProfilePicture = async () => {
    if (!context?.user?.fid) {
      toast.error('FID not available, cannot update profile picture');
      return;
    }
    
    if (!selectedColor) {
      toast.error('Please select a color first');
      return;
    }
    
    // Check if we have a Neynar signer UUID, if not connect first
    if (!isAuthenticated || !user?.signer_uuid) {
      toast.error('Please connect with Farcaster first');
      return;
    }
    
    let toastId = toast.loading('Setting new profile picture...');
    setLoading(true);
    setErrorMessage(null);
    
    try {
      // Generate SVG for the selected color
      const svgImage = generateColorSvg(selectedColor);
      console.log('Generated SVG image with length:', svgImage.length);
      
      // First, upload the image to our server
      toast.dismiss(toastId);
      toastId = toast.loading('Uploading image...');
      
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: svgImage }),
      });
      
      if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.json();
        throw new Error(`Failed to upload image: ${uploadError.error || uploadResponse.statusText}`);
      }
      
      const uploadData = await uploadResponse.json();
      console.log('Image uploaded successfully:', uploadData);
      
      // Now set the profile picture using the Neynar signer and the uploaded image URL
      toast.dismiss(toastId);
      toastId = toast.loading('Setting your new profile picture...');
      
      console.log('Sending request to change PFP with FID:', context.user.fid);
      
      // Use our updated API endpoint with Neynar signer UUID
      const changePfpResponse = await fetch('/api/change-pfp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: context.user.fid,
          pfp: uploadData.url,
          signerUuid: user.signer_uuid, // Use the signer UUID directly from Neynar context
          previousPfp: currentProfilePictureUrl, // Send the current profile picture URL to delete it
        }),
      });
      
      // Handle the response
      const pfpResult = await changePfpResponse.json();
      
      if (!changePfpResponse.ok) {
        throw new Error(`Failed to update profile picture: ${pfpResult.error || pfpResult.message || changePfpResponse.statusText}`);
      }
      
      console.log('Profile picture update result:', pfpResult);
      
      // Update the current profile picture URL
      setCurrentProfilePictureUrl(uploadData.url);
      
      toast.dismiss(toastId);
      toast.success('Profile picture updated successfully!');
      
    } catch (error) {
      console.error('Error updating profile picture:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setErrorMessage(errorMsg);
      toast.error(`Failed to update profile picture: ${errorMsg}`);
    } finally {
      toast.dismiss(toastId);
      setLoading(false);
    }
  };

  // Check for stored authentication on component mount
  useEffect(() => {
    try {
      // Skip this check if already authenticated
      if (isAuthenticated) {
        return;
      }
      
      // Check if we have authentication data in localStorage
      const hasAuthSuccess = window.localStorage.getItem('neynar_auth_success') === 'true';
      const storedAuthData = window.localStorage.getItem('neynar_auth_data');
      
      if (hasAuthSuccess && storedAuthData) {
        console.log('Found stored authentication data');
        try {
          const authData = JSON.parse(storedAuthData);
          if (authData?.user?.fid) {
            console.log('Attempting to hydrate authentication from storage, FID:', authData.user.fid);
            // We can't automatically restore the auth session, but we can show a message
            toast.success('Please click Connect with Farcaster to reconnect your session', {
              duration: 5000,
              style: {
                background: '#3b82f6', // Blue-500
                color: '#ffffff'
              },
              icon: '📝'
            });
          }
        } catch (e) {
          console.error('Error parsing stored auth data:', e);
          // Clear invalid data
          window.localStorage.removeItem('neynar_auth_success');
          window.localStorage.removeItem('neynar_auth_data');
        }
      }
    } catch (error) {
      console.error('Error checking stored authentication:', error);
    }
  }, [isAuthenticated]);

  if (!isInFrame) {
    return (
      <div className="p-4 text-center">
        <Toaster />
        <h1 className="text-xl font-bold mb-4">Base Colors Profile Picture Manager</h1>
        <p>
          This application needs to be opened in a Farcaster frame.
          <br />
          Please open it from a Farcaster client.
        </p>
      </div>
    );
  }

  // Helper function to render color selection UI
  const renderColorSelection = () => {
    if (fetchingNFTs) {
      return (
        <div className="flex flex-col items-center justify-center py-4 bg-[#0C1428] rounded-xl p-4 mb-4">
          <div className="animate-pulse flex space-x-4 mb-3">
            <div className="rounded-full bg-gray-700 h-10 w-10"></div>
            <div className="flex-1 space-y-3 py-1">
              <div className="h-2 bg-gray-700 rounded"></div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-2 bg-gray-700 rounded col-span-2"></div>
                  <div className="h-2 bg-gray-700 rounded col-span-1"></div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-slate-300 animate-pulse">Loading your Base Colors...</p>
        </div>
      );
    }
    
    if (ownedColors.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-5 bg-[#0C1428] rounded-xl mb-4">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-14 w-14 text-slate-500 mb-3" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={1.5}
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
            />
          </svg>
          <h3 className="text-xl font-medium mb-2 text-white">No Base Colors Found</h3>
          <p className="text-slate-300 mb-4 text-center leading-relaxed">You don&apos;t own any Base Colors yet. Get your unique color NFT to use as a profile picture.</p>
          <a 
            href="https://basecolors.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="bg-blue-600 text-white py-2 px-6 rounded-lg font-medium hover:bg-blue-700 transition-all"
          >
            Get Base Colors
          </a>
        </div>
      );
    }
    
    return (
      <div className="bg-[#0C1428] p-4 rounded-xl mb-3">
        <h3 className="text-lg font-medium mb-3 text-white">Your Base Colors</h3>
        <div className="relative">
          {/* Large color preview taking up most of the space */}
          <div 
            className="w-full aspect-square rounded-md shadow-lg mb-3 relative"
            style={{ backgroundColor: selectedColor || '#ffffff' }}
          >
            {/* Color hex value displayed in top right of the preview */}
            {selectedColor && (
              <div className="absolute top-3 right-3">
                <p className="text-xs font-mono bg-black/80 py-1 px-2 rounded-md text-slate-300">{selectedColor}</p>
              </div>
            )}
            
            {/* Color name displayed at the bottom */}
            {selectedColorName && selectedColorName !== selectedColor && (
              <div className="absolute bottom-3 left-3 right-3">
                <p className="text-sm font-medium bg-black/80 py-1 px-3 rounded-md text-white text-center truncate">{selectedColorName}</p>
              </div>
            )}
          </div>
          
          {/* Color options with horizontal scrolling */}
          <div className="flex overflow-x-auto pb-2 space-x-3 snap-x snap-mandatory">
            {ownedColors.map((color) => (
              <div
                key={color.tokenId}
                className={`flex-none w-14 h-14 rounded-md cursor-pointer transition-all snap-start ${
                  selectedColor === color.colorValue 
                    ? 'border-2 border-white shadow-md' 
                    : 'border border-gray-700'
                }`}
                style={{ backgroundColor: color.colorValue }}
                onClick={() => {
                  setSelectedColor(color.colorValue);
                  setSelectedColorName(color.name);
                }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#0F2352] min-h-screen w-full">
      <div className="w-full py-8 px-6">
        <div className="absolute top-2 right-2 text-white/60 hover:text-white">
          <button
            onClick={() => frameSdkOriginal.actions.close()}
            aria-label="Close frame"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#0F1318',
              color: '#fff',
              borderRadius: '8px',
            },
          }}
        />
        
        <h1 className="text-3xl font-bold mb-5 text-white text-center">
          Base Colors
        </h1>
        
        {!isConnected ? (
          <div className="bg-[#0C1428] rounded-xl p-5 mb-4">
            <h3 className="text-xl font-medium mb-3 text-white">Connect Wallet</h3>
            <button
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-all"
              onClick={connectWallet}
              disabled={loading}
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Connected wallet address display */}
            <div className="bg-[#0C1428] rounded-xl p-3 mb-3">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <p className="text-white font-medium">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Wallet Connected'}
                </p>
              </div>
            </div>
            
            {/* Color selection */}
            {renderColorSelection()}
            
            {/* Farcaster connection */}
            {ownedColors.length > 0 && (
              <div className="bg-[#0C1428] rounded-xl p-5 mb-3">
                {!isAuthenticated ? (
                  <>
                    <h3 className="text-xl font-medium mb-3 text-white">Connect Farcaster</h3>
                    <p className="text-slate-300 mb-4 text-sm">
                      Connect your Farcaster account to update your profile picture.
                    </p>
                    <div className="w-full">
                      <NeynarAuthButton 
                        variant={SIWN_variant.NEYNAR} 
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#2563EB', // Blue-600 from Tailwind
                          color: 'white',
                          fontWeight: '500',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '16px',
                          transition: 'background-color 0.2s ease',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#1D4ED8'; // Blue-700 from Tailwind
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#2563EB'; // Blue-600 from Tailwind
                        }}
                        onClick={() => {
                          console.log("NeynarAuthButton clicked");
                          toast.loading("Connecting to Farcaster...");
                          startAuthTimeout(); // Start the authentication timeout
                        }}
                      />
                      <div className="mt-3 text-xs text-slate-400">
                        <p>Having trouble? Try these steps:</p>
                        <ol className="list-decimal list-inside mt-1 space-y-1">
                          <li>Make sure pop-ups are allowed in your browser</li>
                          <li>If using a mobile device, ensure you&apos;re in the Warpcast app</li>
                          <li>Refresh the page and try again</li>
                        </ol>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      className={`w-full py-3 px-4 rounded-lg font-medium ${
                        loading || !selectedColor 
                          ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 transition-all'
                      }`}
                      onClick={updateProfilePicture}
                      disabled={loading || !selectedColor}
                    >
                      {loading ? 
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span> 
                        : "Set as Profile Picture"
                      }
                    </button>
                    
                    <div className="mt-2 text-center">
                      <p className="text-slate-400 text-xs">
                        Using Farcaster account with username: {user?.username || 'Unknown'}
                      </p>
                    </div>
                    
                    {errorMessage && (
                      <div className="p-3 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                        <p className="font-bold mb-1">Error</p>
                        {errorMessage}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            
            {deepLinkUrl && loading && (
              <div className="flex flex-col items-center bg-[#0C1428] p-4 rounded-xl">
                <p className="mb-2 text-sm font-medium text-white">Scan this QR code:</p>
                <div className="p-2 bg-white rounded-lg">
                  <QRCode value={deepLinkUrl} size={140} />
                </div>
                <button
                  className="mt-2 text-blue-400 underline hover:text-blue-300 transition-colors text-sm"
                  onClick={() => frameSdkOriginal.actions.openUrl(deepLinkUrl)}
                >
                  Open URL
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 