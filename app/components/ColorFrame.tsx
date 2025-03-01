'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import QRCode from 'react-qr-code';
import toast, { Toaster } from 'react-hot-toast';
import frameSdk, { Context } from '@farcaster/frame-sdk';
import { useAccount, useConnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { fetchOwnedBaseColors, generateColorSvg, BaseColor } from '../utils/baseColors';
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

// State atoms for signer/Neynar data
const neynarSignerUuidAtom = atom<string | null>(null);

// Add a function to initialize SIWN
function initializeSignInWithNeynar(onSuccess: (data: NeynarSignInData) => void) {
  // Check if we're in the browser environment
  if (typeof window !== 'undefined') {
    console.log('Initializing Sign In with Neynar...');
    
    // First, define the callback function - must be done before loading script
    window.onNeynarSignInSuccess = onSuccess;
    
    // Create container div if needed
    let container = document.getElementById('neynar_signin_container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'neynar_signin_container';
      document.body.appendChild(container);
    }
    
    // Clear any existing content
    container.innerHTML = '';
    
    // Make the container visible but positioned in a fixed location where it can be clicked
    // This is important - it needs to be visible and clickable, but not in the way
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.opacity = '0.01'; // Almost invisible but still clickable
    container.style.zIndex = '9999'; // High z-index to ensure it's clickable
    
    // Get client ID from environment variables
    const clientId = process.env.NEXT_PUBLIC_NEYNAR_CLIENT_ID || '';
    
    // Create the button div according to Neynar docs
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'neynar_signin';
    buttonDiv.setAttribute('data-client_id', clientId);
    buttonDiv.setAttribute('data-success-callback', 'onNeynarSignInSuccess');
    buttonDiv.setAttribute('data-theme', 'dark');
    container.appendChild(buttonDiv);
    
    // Remove any existing script to avoid conflicts
    const existingScript = document.querySelector('script[src*="neynarxyz.github.io/siwn"]');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Add the script
    const script = document.createElement('script');
    script.src = 'https://neynarxyz.github.io/siwn/raw/1.2.0/index.js';
    script.async = true;
    
    script.onload = () => {
      console.log('SIWN script loaded successfully');
    };
    
    script.onerror = (error) => {
      console.error('Failed to load SIWN script:', error);
    };
    
    document.body.appendChild(script);
    
    return true;
  }
  
  return false;
}

interface ColorFrameProps {
  context?: Context.FrameContext;
}

export default function ColorFrame({ context }: ColorFrameProps) {
  const [ownedColors, setOwnedColors] = useState<BaseColor[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedColorName, setSelectedColorName] = useState<string | null>(null);
  // We need deepLinkUrl for QR code functionality
  const deepLinkUrlState = useState<string | null>(null);
  const deepLinkUrl = deepLinkUrlState[0];
  const [loading, setLoading] = useState<boolean>(false);
  // Track the current profile picture URL to delete it when updating
  const [currentProfilePictureUrl, setCurrentProfilePictureUrl] = useState<string | null>(null);

  // Auto-cycle feature temporarily disabled - will implement later
  // const [selectedInterval, setSelectedInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // const [autoCycleEnabled, setAutoCycleEnabled] = useState<boolean>(false);

  // We don't use the signer atom values directly but need the atom for state management
  const [neynarSignerUuid, setNeynarSignerUuid] = useAtom(neynarSignerUuidAtom);
  const [fetchingNFTs, setFetchingNFTs] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Access wagmi hooks for wallet connection
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  
  // Auto connect to wallet
  useEffect(() => {
    // Only attempt auto-connect if not already connected
    if (!isConnected && connectors.length > 0) {
      // Find the injected connector (e.g., MetaMask) or use the first available
      const injectedConnector = connectors.find(c => c.id === 'injected') || connectors[0];
      if (injectedConnector) {
        // Connect automatically with a small delay to ensure everything is loaded
        const timer = setTimeout(() => {
          connect({ connector: injectedConnector });
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isConnected, connectors, connect]);

  // Check if we're in a Farcaster frame
  const isInFrame = useMemo(() => {
    return !!context?.user?.fid;
  }, [context]);

  // Initialize SIWN on component mount
  useEffect(() => {
    if (isInFrame) {
      initializeSignInWithNeynar((data) => {
        console.log('Neynar sign-in success:', data);
        // Store the signer UUID for API calls
        setNeynarSignerUuid(data.signer_uuid);
        
        // Fetch the user's current profile picture URL
        if (data.user.fid) {
          fetchUserProfilePicture(data.user.fid);
        }
      });
    }
  }, [isInFrame, setNeynarSignerUuid]);

  // Function to fetch the current profile picture URL
  const fetchUserProfilePicture = async (fid: number) => {
    try {
      const toastId = toast.loading("Fetching current profile...");
      
      // Call the Neynar API to get the user profile
      const response = await fetch(`/api/get-user-profile?fid=${fid}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const data = await response.json();
      
      if (data.user && data.user.pfp_url) {
        console.log('Current profile picture URL:', data.user.pfp_url);
        setCurrentProfilePictureUrl(data.user.pfp_url);
      }
      
      toast.dismiss(toastId);
    } catch (error) {
      console.error('Error fetching profile picture:', error);
      // Don't show an error toast as this is not critical
    }
  };

  // Function to connect with Neynar
  const connectWithNeynar = () => {
    // Check if we're in a Farcaster frame
    if (!isInFrame) {
      toast.error("This feature is only available in a Farcaster frame");
      return;
    }

    // If we already have a Neynar signer UUID, we're connected
    if (neynarSignerUuid) {
      toast.success("Already connected with Neynar");
      return;
    }
    
    console.log("Attempting to connect with Neynar...");
    const toastId = toast.loading("Connecting with Neynar...");
    
    // Re-initialize the SIWN flow to ensure the button exists
    initializeSignInWithNeynar((data) => {
      console.log('Neynar sign-in success data:', data);
      setNeynarSignerUuid(data.signer_uuid);
      toast.dismiss(toastId);
      toast.success(`Connected with Farcaster as ${data.user.username}!`);
      
      // Fetch the user's current profile picture URL
      if (data.user.fid) {
        fetchUserProfilePicture(data.user.fid);
      }
    });
    
    // Wait for script to load and initialize before clicking
    // Using a slightly longer timeout to ensure everything is ready
    setTimeout(() => {
      // Try to find the button after initialization
      const siwnButton = document.querySelector('.neynar_signin button') as HTMLElement;
      console.log("SIWN button element found:", !!siwnButton);
      
      if (siwnButton) {
        // Directly click the actual button element rendered by the script
        siwnButton.click();
        console.log("SIWN button clicked");
      } else {
        // Try the container as fallback
        const container = document.querySelector('.neynar_signin') as HTMLElement;
        if (container) {
          container.click();
          console.log("SIWN container clicked as fallback");
        } else {
          toast.dismiss(toastId);
          toast.error("Couldn't find the Neynar sign-in button. Please reload the page and try again.");
          console.error("SIWN elements not found in DOM");
        }
      }
    }, 300); // Increase timeout to ensure script has time to initialize
  };

  // Track active toast IDs for proper cleanup
  const fetchToastIdRef = useRef<string | null>(null);
  
  // Fetch owned Base Colors when wallet is connected
  useEffect(() => {
    let isMounted = true;

    async function getOwnedColors() {
      if (!address || fetchingNFTs) return;
      
      try {
        // Clear any existing fetch toast first to prevent duplicates
        if (fetchToastIdRef.current) {
          toast.dismiss(fetchToastIdRef.current);
        }
        
        setFetchingNFTs(true);
        setOwnedColors([]); // Clear previous colors
        setSelectedColor(null); // Clear selected color
        setSelectedColorName(null);
        
        const toastId = toast.loading('Fetching your Base Colors...');
        fetchToastIdRef.current = toastId;
        
        const colors = await fetchOwnedBaseColors(address);
        
        // Only update state if component is still mounted
        if (isMounted) {
          if (colors.length > 0) {
            setOwnedColors(colors);
            setSelectedColor(colors[0].colorValue);
            setSelectedColorName(colors[0].name);
            toast.success(`Found ${colors.length} Base Colors`);
          } else {
            setOwnedColors([]);
            setSelectedColor(null);
            setSelectedColorName(null);
            toast.error('No Base Colors found for this wallet');
          }
        }

        if (isMounted) {
          toast.dismiss(toastId);
          fetchToastIdRef.current = null;
        }
      } catch (error) {
        console.error('Error fetching owned colors:', error);
        if (isMounted) {
          setOwnedColors([]);
          setSelectedColor(null);
          setSelectedColorName(null);
          toast.error('Failed to fetch owned colors');
        }
      } finally {
        if (isMounted) {
          setFetchingNFTs(false);
          
          // Ensure toast is dismissed even if there was an error
          if (fetchToastIdRef.current) {
            toast.dismiss(fetchToastIdRef.current);
            fetchToastIdRef.current = null;
          }
        }
      }
    }
    
    if (address && isConnected) {
      getOwnedColors();
    }

    return () => {
      isMounted = false;
      // Clean up any active toasts when unmounting
      if (fetchToastIdRef.current) {
        toast.dismiss(fetchToastIdRef.current);
      }
    };
  }, [address, isConnected]);

  // Function to set profile picture using Neynar
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
    if (!neynarSignerUuid) {
      toast.error('Please connect with Farcaster first');
      connectWithNeynar();
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
          signerUuid: neynarSignerUuid,
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
            onClick={() => frameSdk.actions.close()}
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
          // Connect wallet step
          <div className="bg-[#0C1428] rounded-xl p-5 mb-4">
            <ConnectButton.Custom>
              {({
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                
                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                    className="w-full"
                  >
                    {!ready ? null : (
                      <button 
                        onClick={openConnectModal} 
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        Connect Wallet
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        ) : (
          <>
            {/* Connected wallet */}
            <div className="bg-[#0C1428] rounded-xl p-3 flex justify-center mb-3">
              <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
            </div>
            
            {/* Color selection */}
            {renderColorSelection()}
            
            {/* Farcaster connection */}
            {ownedColors.length > 0 && (
              <div className="bg-[#0C1428] rounded-xl p-5 mb-3">
                {!neynarSignerUuid ? (
                  <>
                    <h3 className="text-xl font-medium mb-3 text-white">Connect Farcaster</h3>
                    <button
                      className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-all"
                      onClick={connectWithNeynar}
                      disabled={loading}
                    >
                      Connect with Farcaster
                    </button>
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
                  onClick={() => frameSdk.actions.openUrl(deepLinkUrl)}
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