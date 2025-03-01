'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import QRCode from 'react-qr-code';
import toast, { Toaster } from 'react-hot-toast';
import frameSdkOriginal, { Context } from '@farcaster/frame-sdk';
import { useAccount, useConnect } from 'wagmi';
import { useNeynarContext } from '@neynar/react';

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

// Define the managed signer response type
interface ManagedSigner {
  signer_uuid: string;
  public_key: string;
  status: string; // Can be "generated", "pending_approval", or "approved"
  signer_approval_url?: string;
  fid?: number;
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
      toast.error('Unable to identify your account. Please try reconnecting.');
      return;
    }
    
    if (!selectedColor) {
      toast.error('Please select a color first');
      return;
    }
    
    // Check if we have a managed signer that is approved
    if (managedSigner?.status !== 'approved' || !managedSigner?.signer_uuid) {
      toast.error('Please connect your Farcaster account first');
      return;
    }
    
    // Use the managed signer UUID
    const signerUuid = managedSigner.signer_uuid;
    
    let toastId = toast.loading('Setting new profile picture...');
    setLoading(true);
    setErrorMessage(null);
    
    try {
      // Generate SVG for the selected color
      const svgImage = generateColorSvg(selectedColor);
      
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
      
      // Now set the profile picture using the Neynar signer and the uploaded image URL
      toast.dismiss(toastId);
      toastId = toast.loading('Setting your new profile picture...');
      
      // Use our updated API endpoint with Neynar signer UUID
      const changePfpResponse = await fetch('/api/change-pfp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: context.user.fid,
          pfp: uploadData.url,
          signerUuid: signerUuid, // Use the managed signer UUID
          previousPfp: currentProfilePictureUrl, // Send the current profile picture URL to delete it
        }),
      });
      
      // Handle the response
      const pfpResult = await changePfpResponse.json();
      
      if (!changePfpResponse.ok) {
        throw new Error(`Failed to update profile picture: ${pfpResult.error || pfpResult.message || changePfpResponse.statusText}`);
      }
      
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

  // Add this inside the ColorFrame component, after the existing state declarations
  const [managedSigner, setManagedSigner] = useState<ManagedSigner | null>(null);
  const [isCreatingSigner, setIsCreatingSigner] = useState<boolean>(false);
  const [isCheckingSigner, setIsCheckingSigner] = useState<boolean>(false);
  const signerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to create a new managed signer
  const createManagedSigner = async () => {
    if (isCreatingSigner) return;
    
    setIsCreatingSigner(true);
    const toastId = toast.loading("Connecting to Farcaster...");
    
    try {
      // Clear any existing intervals to prevent state conflicts
      if (signerCheckIntervalRef.current) {
        clearInterval(signerCheckIntervalRef.current);
        signerCheckIntervalRef.current = null;
      }
      
      // Clear any previous error state
      setErrorMessage(null);
      
      const response = await fetch('/api/neynar/signer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Connection failed: ${JSON.stringify(errorData)}`);
      }
      
      const signer = await response.json();
      
      // Set the initial signer state
      setManagedSigner({
        signer_uuid: signer.signer_uuid,
        public_key: signer.public_key || '',
        status: signer.status || 'generated',
        signer_approval_url: signer.signer_approval_url
      });
      
      // Store the signer in localStorage
      localStorage.setItem('neynar_auth_data', JSON.stringify(signer));
      localStorage.setItem('neynar_auth_success', 'true');
      
      toast.success("Connection initialized!");
      
      // We need to register the signer to get an approval URL
      try {
        // Update toast to show registration in progress
        toast.dismiss(toastId);
        const registerToastId = toast.loading("Preparing approval link...");
        
        const registerResponse = await fetch('/api/neynar/register-signer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            signer_uuid: signer.signer_uuid
          })
        });
        
        if (!registerResponse.ok) {
          console.error('Error auto-registering new signer:', await registerResponse.text());
          toast.dismiss(registerToastId);
          toast.error("Could not get approval link automatically. Will try again in a moment.");
          
          // We can still poll with the original UUID
          startSignerApprovalPolling(signer.signer_uuid);
          return;
        }
        
        const registeredSigner = await registerResponse.json();
        
        // Dismiss the registration toast
        toast.dismiss(registerToastId);
        
        if (registeredSigner.signer_approval_url) {
          // Create an updated signer object with all the necessary fields
          const updatedSigner = {
            // Start with all fields from the original signer to ensure we don't lose anything
            ...signer,
            // Then override with the registration response
            signer_uuid: registeredSigner.signer_uuid,
            status: 'pending_approval',
            signer_approval_url: registeredSigner.signer_approval_url,
            public_key: registeredSigner.public_key || signer.public_key || ''
          };
          
          // Update the state with the complete signer info
          setManagedSigner(updatedSigner);
          
          // Update localStorage with the complete data
          localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
          
          // Start polling with the new signer UUID
          startSignerApprovalPolling(registeredSigner.signer_uuid);
          toast.success("Approval link ready! Scan the QR code to complete connection.");
        } else {
          toast.error("Could not get approval link, trying alternative method...");
          // Fall back to polling with the original UUID
          startSignerApprovalPolling(signer.signer_uuid);
        }
      } catch (regError) {
        console.error('Error in auto-registration:', regError);
        toast.error("Connection error. Will try again automatically.");
        // Fall back to normal polling
        startSignerApprovalPolling(signer.signer_uuid);
      }
    } catch (error) {
      console.error('Error creating managed signer:', error);
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      toast.dismiss(toastId);
      setIsCreatingSigner(false);
    }
  };
  
  // Function to manually trigger signer registration
  const triggerManualRegistration = async () => {
    if (!managedSigner?.signer_uuid) {
      toast.error("No connection available");
      return;
    }
    
    const toastId = toast.loading("Getting approval link...");
    
    try {
      // Clear any error state
      setErrorMessage(null);
      
      const response = await fetch('/api/neynar/register-signer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signer_uuid: managedSigner.signer_uuid
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Manual registration error:', errorText);
        toast.error("Failed to get approval link: " + errorText);
        return;
      }
      
      const data = await response.json();
      
      if (data.signer_approval_url) {
        // Create an updated signer with all necessary fields
        const updatedSigner = {
          // Start with existing signer data to preserve any fields
          ...managedSigner,
          // Override with the new data
          signer_uuid: data.signer_uuid, // Use the new signer_uuid
          status: 'pending_approval',
          signer_approval_url: data.signer_approval_url,
          public_key: data.public_key || managedSigner.public_key || ''
        };
        
        // Update the managed signer state
        setManagedSigner(updatedSigner);
        
        // Store the complete signer info
        localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
        
        toast.success("Successfully got approval link!");
        
        // Restart polling with the new signer UUID
        // First clear any existing interval
        if (signerCheckIntervalRef.current) {
          clearInterval(signerCheckIntervalRef.current);
          signerCheckIntervalRef.current = null;
        }
        
        startSignerApprovalPolling(data.signer_uuid);
      } else {
        toast.error("No approval link returned");
      }
    } catch (error) {
      console.error('Error in manual registration:', error);
      toast.error("Failed to get approval link: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      toast.dismiss(toastId);
    }
  };
  
  // Function to start polling for signer approval
  const startSignerApprovalPolling = (signerUuid: string) => {
    // Clear any existing interval
    if (signerCheckIntervalRef.current) {
      clearInterval(signerCheckIntervalRef.current);
    }
    
    setIsCheckingSigner(true);
    
    // Start polling every 3 seconds
    signerCheckIntervalRef.current = setInterval(async () => {
      try {
        // Use our improved signer-status endpoint
        const response = await fetch(`/api/neynar/signer-status?signer_uuid=${signerUuid}`);
        
        if (!response.ok) {
          console.error('Error checking signer status:', await response.text());
          // Don't update the state on error, just return early
          return;
        }
        
        const signer = await response.json();
        console.log('Signer status check:', signer);
        
        // Check if the response contains error or if essential properties are missing
        if (signer.error || (!signer.status && !signer.signer_uuid)) {
          console.error('Invalid signer response:', signer);
          // Don't update state for invalid responses
          return;
        }
        
        // If we have a valid signer response, proceed with updating state
        // Make sure we preserve the approval URL even if it's not in the new response
        if (managedSigner?.signer_approval_url && !signer.signer_approval_url && signer.status === 'pending_approval') {
          // Keep the existing approval URL to prevent the QR code from disappearing
          signer.signer_approval_url = managedSigner.signer_approval_url;
        }
        
        // Update the signer state with the merged data
        setManagedSigner(prevSigner => {
          if (!prevSigner) return signer;
          
          // Create merged signer object that preserves important fields
          return {
            ...prevSigner,
            ...signer,
            // Ensure we don't lose the approval URL if we had one before
            signer_approval_url: signer.signer_approval_url || prevSigner.signer_approval_url
          };
        });
        
        // If the signer is in "generated" status, immediately call the registration endpoint to get an approval URL
        if (signer.status === 'generated') {
          try {
            console.log('Signer is in "generated" state, registering signer...');
            const registerResponse = await fetch('/api/neynar/register-signer', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                signer_uuid: signer.signer_uuid
              })
            });
            
            if (!registerResponse.ok) {
              const errorText = await registerResponse.text();
              console.error('Error registering signer:', errorText);
              toast.error("Failed to register signer, please try again.");
              return;
            }
            
            const registeredSigner = await registerResponse.json();
            console.log('Registered signer:', registeredSigner);
            
            // Only update if we have an approval URL
            if (registeredSigner.signer_approval_url) {
              // Update signer with the new signer_uuid and approval URL
              setManagedSigner(prevSigner => ({
                ...(prevSigner || {}),
                signer_uuid: registeredSigner.signer_uuid, // Use the new UUID
                status: registeredSigner.status || 'pending_approval',
                signer_approval_url: registeredSigner.signer_approval_url,
                public_key: registeredSigner.public_key || (prevSigner?.public_key || '')
              }));
              
              // Update localStorage with the updated signer
              const updatedSigner = {
                ...(managedSigner || {}),
                signer_uuid: registeredSigner.signer_uuid,
                status: registeredSigner.status || 'pending_approval',
                signer_approval_url: registeredSigner.signer_approval_url,
                public_key: registeredSigner.public_key || (managedSigner?.public_key || '')
              };
              
              localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
              
              // Restart polling with the new signer UUID
              clearInterval(signerCheckIntervalRef.current!);
              startSignerApprovalPolling(registeredSigner.signer_uuid);
              
              toast.success("Registration URL created! Please scan the QR code to approve.");
            } else {
              // If no approval URL came back, wait for the next polling cycle
              console.log('No approval URL returned, waiting for next poll cycle');
              toast.error("Could not get approval URL, trying again...");
            }
          } catch (regError) {
            console.error('Error registering signer:', regError);
            toast.error("Registration error. Please try again.");
          }
        }
        
        // If the signer is approved, stop polling and update state
        if (signer.status === 'approved') {
          if (signerCheckIntervalRef.current) {
            clearInterval(signerCheckIntervalRef.current);
            signerCheckIntervalRef.current = null;
          }
          
          setIsCheckingSigner(false);
          
          // Update localStorage with the approved signer
          localStorage.setItem('neynar_auth_data', JSON.stringify(signer));
          
          // Set the signer UUID for API calls
          setNeynarSignerUuid(signer.signer_uuid);
          
          toast.success("Signer approved! You can now update your profile picture.");
          
          // If we have an FID, fetch the user's profile picture
          if (signer.fid) {
            fetchUserProfilePicture(signer.fid);
          }
          
          // Add redirection to the frame
          // If we're in a frame, use the Frame SDK to redirect
          if (isInFrame) {
            // First show a success message
            toast.success("Authentication successful! Redirecting...", {
              duration: 2000,
            });
            
            // Use setTimeout to allow the success toast to be seen before redirecting
            setTimeout(() => {
              try {
                // Close the frame and redirect to home page
                frameSdkOriginal.actions.close();
                console.log("Frame closed after signer approval");
                
                // After a brief moment, redirect to home
                setTimeout(() => {
                  window.location.href = '/';
                }, 500);
              } catch (error) {
                console.error("Error closing frame:", error);
                // As a last resort, just redirect
                window.location.href = '/';
              }
            }, 2000); // Wait 2 seconds before redirecting
          }
        }
      } catch (error) {
        console.error('Error polling for signer approval:', error);
        // Don't change state on unexpected errors
      }
    }, 3000);
  };
  
  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (signerCheckIntervalRef.current) {
        clearInterval(signerCheckIntervalRef.current);
      }
    };
  }, []);
  
  // Add a function to force the correct signer status based on API data
  const forceCorrectSignerStatus = async () => {
    if (!managedSigner?.signer_uuid) {
      toast.error("No connection available");
      return;
    }
    
    const toastId = toast.loading("Checking connection status...");
    
    try {
      // First, check with our debug endpoint to see raw API response
      const debugResponse = await fetch(`/api/neynar/signer-debug?signer_uuid=${managedSigner.signer_uuid}`);
      const debugData = await debugResponse.json();
      
      // Now get the standard formatted signer data
      const response = await fetch(`/api/neynar/signer-status?signer_uuid=${managedSigner.signer_uuid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get status: ${response.statusText}`);
      }
      
      // The raw API response should be available in debugData.parsedResponse
      // Let's analyze the correct path to the status
      let correctedStatus = 'unknown';
      let correctedFid = null;
      
      if (debugData?.parsedResponse?.result?.status) {
        // For v2 API where status is inside result
        correctedStatus = debugData.parsedResponse.result.status;
        correctedFid = debugData.parsedResponse.result.fid;
      } else if (debugData?.parsedResponse?.status) {
        // For some versions where status is at the top level
        correctedStatus = debugData.parsedResponse.status;
        correctedFid = debugData.parsedResponse.fid;
      }
      
      // Manual override: Always use the status from the raw API response
      const correctedSigner = {
        ...managedSigner, // Keep all existing fields
        status: correctedStatus, // Use the correctly extracted status
        fid: correctedFid || managedSigner.fid, // Keep FID from API or existing state
      };
      
      // Update the state with corrected data
      setManagedSigner(correctedSigner);
      
      // Also update localStorage with the corrected data
      localStorage.setItem('neynar_auth_data', JSON.stringify(correctedSigner));
      
      // Set the signer UUID for API calls if status is approved
      if (correctedSigner.status === 'approved') {
        setNeynarSignerUuid(correctedSigner.signer_uuid);
        
        // If we have an FID, fetch the user's profile picture
        if (correctedSigner.fid) {
          fetchUserProfilePicture(correctedSigner.fid);
        }
        
        toast.success('Connection verified!');
      } else {
        toast.success(`Connection status: ${correctedSigner.status === 'pending_approval' ? 'waiting for approval' : correctedSigner.status}`);
      }
    } catch (error) {
      console.error('Error forcing signer status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to verify connection status');
    } finally {
      toast.dismiss(toastId);
    }
  };
  
  // Use this effect to log the important values on each render
  useEffect(() => {
    console.log('Render evaluation:', {
      isAuthenticated,
      managedSignerStatus: managedSigner?.status,
      managedSignerFid: managedSigner?.fid,
      conditionResult: isAuthenticated || managedSigner?.status === 'approved'
    });
  }, [isAuthenticated, managedSigner?.status, managedSigner?.fid]);

  // Add a function to manually refresh the signer status from the API
  const refreshSignerStatus = async () => {
    if (!managedSigner?.signer_uuid) {
      toast.error("No connection available to refresh");
      return;
    }
    
    const toastId = toast.loading("Refreshing connection status...");
    
    try {
      // First check with our debug endpoint to understand the raw API response
      const debugResponse = await fetch(`/api/neynar/signer-debug?signer_uuid=${managedSigner.signer_uuid}`);
      const debugData = await debugResponse.json();
      
      // Then get the standard API response
      const response = await fetch(`/api/neynar/signer-status?signer_uuid=${managedSigner.signer_uuid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to refresh status: ${response.statusText}`);
      }
      
      const freshSigner = await response.json();
      
      // Extract the correct status from the raw API response
      let correctStatus = 'unknown';
      let correctFid = null;
      
      if (debugData?.parsedResponse?.result?.status) {
        // For v2 API where status is inside result
        correctStatus = debugData.parsedResponse.result.status;
        correctFid = debugData.parsedResponse.result.fid;
      } else if (debugData?.parsedResponse?.status) {
        // For some versions where status is at the top level
        correctStatus = debugData.parsedResponse.status;
        correctFid = debugData.parsedResponse.fid;
      }
      
      // Create an updated signer with the correct status
      const updatedSigner = {
        ...managedSigner,
        // Preserve any other fields from the API response
        ...freshSigner,
        // Make sure our corrected values take precedence - no duplicate properties
        status: correctStatus,
        fid: correctFid || freshSigner.fid || managedSigner.fid,
      };
      
      // Update the managed signer with the fresh data
      setManagedSigner(updatedSigner);
      
      // Update localStorage with the latest data
      localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
      
      if (correctStatus === 'approved') {
        toast.success('Connection is active!');
        
        // Set the signer UUID for API calls
        setNeynarSignerUuid(updatedSigner.signer_uuid);
        
        // If we have an FID, fetch the user's profile picture
        if (updatedSigner.fid) {
          fetchUserProfilePicture(updatedSigner.fid);
        }
      } else {
        toast.success(`Connection status: ${correctStatus === 'pending_approval' ? 'waiting for approval' : correctStatus}`);
      }
    } catch (error) {
      console.error('Error refreshing signer status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to refresh connection status');
    } finally {
      toast.dismiss(toastId);
    }
  };

  // Check for stored signer on component mount
  useEffect(() => {
    const checkStoredSigner = async () => {
      try {
        const storedAuthData = localStorage.getItem('neynar_auth_data');
        
        if (storedAuthData) {
          try {
            const signer = JSON.parse(storedAuthData) as ManagedSigner;
            console.log('Found stored signer:', signer);
            
            // If we have a signer_uuid but strange/unknown status, double check with API
            if (signer.signer_uuid && (signer.status === 'unknown' || !signer.status)) {
              // Check with API to get the actual status
              try {
                const response = await fetch(`/api/neynar/signer-status?signer_uuid=${signer.signer_uuid}`);
                if (response.ok) {
                  const apiSigner = await response.json();
                  console.log('API check for stored signer:', apiSigner);
                  
                  // Use API data to override local storage status if possible
                  if (apiSigner.status) {
                    signer.status = apiSigner.status;
                  }
                  if (apiSigner.fid) {
                    signer.fid = apiSigner.fid;
                  }
                }
              } catch (apiError) {
                console.error('Error checking API for signer status:', apiError);
                // Continue with existing data if API check fails
              }
            }
            
            // Now update state with potentially corrected data
            setManagedSigner(signer);
            
            // If the signer is pending approval, start polling
            if (signer.status === 'pending_approval' && signer.signer_uuid) {
              startSignerApprovalPolling(signer.signer_uuid);
            }
            
            // If the signer is approved, set the signer UUID for API calls
            if (signer.status === 'approved') {
              setNeynarSignerUuid(signer.signer_uuid);
              
              // If we have an FID, fetch the user's profile picture
              if (signer.fid) {
                fetchUserProfilePicture(signer.fid);
              }
            }
          } catch (parseError) {
            console.error('Error parsing stored signer data:', parseError);
            // Clear invalid data
            localStorage.removeItem('neynar_auth_data');
            localStorage.removeItem('neynar_auth_success');
          }
        }
      } catch (error) {
        console.error('Error checking stored signer:', error);
      }
    };
    
    checkStoredSigner();
  }, []);

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
                {/* Debug info - hidden by default */}
                <div className="border border-gray-700 rounded p-2 mb-3 text-xs text-white hidden">
                  <p>Debug info:</p>
                  <p>isAuthenticated: {isAuthenticated ? 'true' : 'false'}</p>
                  <p>managedSigner?.status: {managedSigner?.status || 'null'}</p>
                  <p>managedSigner?.fid: {managedSigner?.fid || 'null'}</p>
                  <p>Condition result: {(isAuthenticated || managedSigner?.status === 'approved') ? 'true' : 'false'}</p>
                </div>

                {/* First check if there's no managed signer or the signer is still in generated state */}
                {(!managedSigner?.status) || (managedSigner?.status === 'generated') ? (
                  <>
                    <h3 className="text-xl font-medium mb-3 text-white">Connect Farcaster</h3>
                    <p className="text-slate-300 mb-4 text-sm">
                      Connect your Farcaster account to update your profile picture.
                    </p>
                    <div className="w-full space-y-3">
                      {/* Only show the Managed Signer Button */}
                      <button
                        className="w-full py-3 px-4 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 transition-all"
                        onClick={createManagedSigner}
                        disabled={isCreatingSigner}
                      >
                        {isCreatingSigner ? (
                          <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Connecting...
                          </span>
                        ) : (
                          "Connect with Farcaster"
                        )}
                      </button>
                      
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
                ) : managedSigner?.status === 'pending_approval' ? (
                  <>
                    <h3 className="text-xl font-medium mb-3 text-white">Approve Connection</h3>
                    <p className="text-slate-300 mb-4 text-sm">
                      Scan this QR code with your phone or click the link to approve the connection.
                    </p>
                    <div className="flex flex-col items-center justify-center">
                      {managedSigner.signer_approval_url && (
                        <div className="p-2 bg-white rounded-lg mb-3">
                          <QRCode value={managedSigner.signer_approval_url} size={200} />
                        </div>
                      )}
                      {managedSigner.signer_approval_url && (
                        <a
                          href={managedSigner.signer_approval_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 underline hover:text-blue-300 transition-colors"
                        >
                          Open approval link
                        </a>
                      )}
                      {isCheckingSigner && (
                        <p className="mt-3 text-sm text-slate-400">
                          Waiting for approval... This page will update automatically.
                        </p>
                      )}
                      {!managedSigner.signer_approval_url && (
                        <div className="flex flex-col items-center my-4">
                          <p className="text-orange-400 text-sm mb-3">
                            Waiting for approval link to be generated...
                          </p>
                          <button
                            className="py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all text-sm"
                            onClick={triggerManualRegistration}
                          >
                            Get new approval link
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                /* FIXED CONDITION - Only check for approved managed signer */
                ) : (managedSigner?.status === 'approved' || 
                    // Also accept 'unknown' status if we have an FID (means API says approved but state is wrong)
                    (managedSigner?.status === 'unknown' && managedSigner?.fid)) ? (
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
                        Using Farcaster account with FID: {managedSigner?.fid || 'Unknown'}
                      </p>
                    </div>
                    
                    {errorMessage && (
                      <div className="p-3 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                        <p className="font-bold mb-1">Error</p>
                        {errorMessage}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-slate-300">
                      Something went wrong with the Farcaster connection. Please try again.
                    </p>
                    <div className="flex flex-col gap-2 mt-3">
                      <button
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                        onClick={refreshSignerStatus}
                      >
                        Refresh Connection
                      </button>
                      
                      <button
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all"
                        onClick={forceCorrectSignerStatus}
                      >
                        Verify Connection
                      </button>
                      
                      <button
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                        onClick={() => {
                          // Clear stored auth data
                          localStorage.removeItem('neynar_auth_data');
                          localStorage.removeItem('neynar_auth_success');
                          // Reset state
                          setManagedSigner(null);
                          // Create a new managed signer
                          createManagedSigner();
                        }}
                      >
                        Start New Connection
                      </button>
                    </div>
                  </div>
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