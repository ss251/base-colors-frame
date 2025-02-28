'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import QRCode from 'react-qr-code';
import toast, { Toaster } from 'react-hot-toast';
import frameSdk, { Context } from '@farcaster/frame-sdk';
import { useAccount, useConnect } from 'wagmi';

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
const signerAtom = atom<string | null>(null);
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
  useAtom(signerAtom);
  const [neynarSignerUuid, setNeynarSignerUuid] = useAtom(neynarSignerUuidAtom);
  const [fetchingNFTs, setFetchingNFTs] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasFetchedColors, setHasFetchedColors] = useState<boolean>(false);
  
  // Access wagmi hooks for wallet connection
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

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
  
  // Function to connect wallet
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
          // Connect wallet using the first available connector
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
          
          // Fallback to mock data
          provideMockData();
        }
      } else {
        // We already have a connected wallet
        toast.success(`Wallet connected: ${address?.slice(0, 6)}...${address?.slice(-4)}`);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
      
      // Fallback to mock data
      provideMockData();
    }
  };
  
  // Helper function to provide mock data when needed
  const provideMockData = () => {
    toast('Using mock Base Colors for demonstration', {
      icon: '🎨',
      duration: 3000,
    });
    
    // Create mock Base Colors with the required imageUrl property
    setTimeout(() => {
      if (ownedColors.length === 0) {
        const mockColors = [
          { tokenId: '1', name: 'Red', colorValue: '#FF0000', imageUrl: 'https://basecolors.xyz/api/image/1' },
          { tokenId: '2', name: 'Green', colorValue: '#00FF00', imageUrl: 'https://basecolors.xyz/api/image/2' },
          { tokenId: '3', name: 'Blue', colorValue: '#0000FF', imageUrl: 'https://basecolors.xyz/api/image/3' },
          { tokenId: '4', name: 'Yellow', colorValue: '#FFFF00', imageUrl: 'https://basecolors.xyz/api/image/4' },
          { tokenId: '5', name: 'Purple', colorValue: '#800080', imageUrl: 'https://basecolors.xyz/api/image/5' },
        ];
        setOwnedColors(mockColors);
        setSelectedColor(mockColors[0].colorValue);
      }
    }, 1000);
  };

  // Fetch owned Base Colors when wallet is connected
  useEffect(() => {
    async function getOwnedColors() {
      if (!address || hasFetchedColors) return;
      
      try {
        setFetchingNFTs(true);
        const toastId = toast.loading('Fetching your Base Colors...');
        const colors = await fetchOwnedBaseColors(address);
        toast.dismiss(toastId);
        
        if (colors.length > 0) {
          setOwnedColors(colors);
          setSelectedColor(colors[0].colorValue);
          toast.success(`Found ${colors.length} Base Colors`);
        } else {
          toast.error('No Base Colors found for this wallet');
          // Provide mock data as fallback if no real colors found
          provideMockData();
        }
      } catch (error) {
        console.error('Error fetching owned colors:', error);
        toast.error('Failed to fetch owned colors');
        // Provide mock data as fallback on error
        provideMockData();
      } finally {
        setFetchingNFTs(false);
        setHasFetchedColors(true);
      }
    }
    
    if (address && isConnected) {
      getOwnedColors();
    }
  }, [address, isConnected, hasFetchedColors]);

  // Reset hasFetchedColors flag when address changes
  useEffect(() => {
    setHasFetchedColors(false);
  }, [address]);

  // Function to schedule auto cycling - temporarily disabled
  /* 
  const handleScheduleUpdates = async () => {
    if (!context?.user?.fid) {
      toast.error('FID not available, cannot schedule updates');
      return;
    }
    
    if (!neynarSignerUuid) {
      toast.error('Please connect with Farcaster first');
      connectWithNeynar();
      return;
    }
    
    if (!selectedColor) {
      toast.error('Please select a color first');
      return;
    }
    
    const toastId = toast.loading(`Scheduling ${selectedInterval} updates...`);
    
    try {
      // Call the API to schedule updates
      const response = await scheduleProfileUpdates({
        fid: context.user.fid,
        signerUuid: neynarSignerUuid,
        interval: selectedInterval,
        colors: ownedColors.map(c => c.colorValue)
      });
      
      toast.dismiss(toastId);
      
      if (response.success) {
        toast.success(`Auto updates scheduled for ${selectedInterval} interval!`);
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error scheduling updates:', error);
      toast.dismiss(toastId);
      toast.error(`Failed to schedule updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  */

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

  return (
    <div className="flex flex-col items-center p-4 max-w-md mx-auto">
      <Toaster />
      <h1 className="text-xl font-bold mb-4">Base Colors Profile Picture</h1>
      
      {!isConnected ? (
        // Step 1: Connect wallet first
        <div className="w-full space-y-2">
          <button
            className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 w-full"
            onClick={connectWallet}
            disabled={loading}
          >
            Connect Wallet
          </button>
        </div>
      ) : !neynarSignerUuid ? (
        // Step 2: After wallet is connected, connect Farcaster if not already connected
        <div className="w-full space-y-2">
          <p className="mb-4">Wallet connected: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown'}</p>
          <button
            className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 w-full"
            onClick={connectWithNeynar}
            disabled={loading}
          >
            Connect with Farcaster
          </button>
        </div>
      ) : (
        // Step 3: Both wallet and Farcaster are connected
        <>
          <p className="mb-4">
            <span className="mr-4">Wallet: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown'}</span>
            <span>Farcaster: Connected</span>
          </p>
          
          {fetchingNFTs ? (
            <p>Loading your Base Colors...</p>
          ) : ownedColors.length === 0 ? (
            <p>You don&apos;t own any Base Colors. Get some first!</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2 w-full mb-4">
                {ownedColors.map((color) => (
                  <div
                    key={color.tokenId}
                    className={`w-12 h-12 rounded-md cursor-pointer border-2 ${
                      selectedColor === color.colorValue ? 'border-indigo-600' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color.colorValue }}
                    onClick={() => setSelectedColor(color.colorValue)}
                    title={color.name}
                  />
                ))}
              </div>
              
              <div className="w-full mb-4">
                {selectedColor && (
                  <div className="flex flex-col items-center">
                    <div
                      className="w-32 h-32 rounded-full mb-2"
                      style={{ backgroundColor: selectedColor }}
                    />
                    <p className="text-sm">{selectedColor}</p>
                  </div>
                )}
              </div>

              {/* Auto-cycle feature - temporarily disabled 
              <div className="w-full mb-4">
                <div className="flex items-center mb-2">
                  <input
                    id="autoCycle"
                    type="checkbox"
                    className="mr-2"
                    checked={autoCycleEnabled}
                    onChange={(e) => setAutoCycleEnabled(e.target.checked)}
                  />
                  <label htmlFor="autoCycle">Auto-cycle through colors</label>
                </div>
                
                {autoCycleEnabled && (
                  <div className="ml-6 mb-2">
                    <label htmlFor="interval" className="block mb-1 text-sm">Change interval:</label>
                    <select 
                      id="interval"
                      className="block w-full p-2 border border-gray-300 rounded-md"
                      value={selectedInterval}
                      onChange={(e) => setSelectedInterval(e.target.value as 'daily' | 'weekly' | 'monthly')}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    
                    <button
                      className="mt-2 bg-green-600 text-white py-1 px-3 rounded-md hover:bg-green-700 text-sm"
                      onClick={handleScheduleUpdates}
                      disabled={loading}
                    >
                      Schedule Auto Updates
                    </button>
                  </div>
                )}
              </div>
              */}
              
              <div className="w-full mb-4">
                <button
                  className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 w-full mb-2"
                  onClick={updateProfilePicture}
                  disabled={loading || !selectedColor}
                >
                  Set as Profile Picture
                </button>
                
                {errorMessage && (
                  <div className="p-3 mt-2 mb-2 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                    {errorMessage}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      
      {deepLinkUrl && loading && (
        <div className="flex flex-col items-center mt-4">
          <p className="mb-2">Please scan this QR code with your mobile device:</p>
          <QRCode value={deepLinkUrl} size={200} />
          <p className="mt-2">
            Or{' '}
            <button
              className="text-indigo-600 underline"
              onClick={() => frameSdk.actions.openUrl(deepLinkUrl)}
            >
              open this URL
            </button>{' '}
            if you&apos;re on mobile.
          </p>
        </div>
      )}
      
      <button
        className="mt-4 text-sm text-gray-500"
        onClick={() => frameSdk.actions.close()}
      >
        Close Frame
      </button>
    </div>
  );
} 