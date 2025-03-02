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
    _lastPollTimestamp?: number;
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
      toast.error('FID not available, cannot update profile picture');
      return;
    }
    
    if (!selectedColor) {
      toast.error('Please select a color first');
      return;
    }
    
    // Check if we have a managed signer that is approved
    if (managedSigner?.status !== 'approved' || !managedSigner?.signer_uuid) {
      toast.error('Please connect with Farcaster first using the managed signer');
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
          signerUuid: signerUuid, // Use the managed signer UUID
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

  // Add this inside the ColorFrame component, after the existing state declarations
  const [managedSigner, setManagedSigner] = useState<ManagedSigner | null>(null);
  const [isCreatingSigner, setIsCreatingSigner] = useState<boolean>(false);
  const [isCheckingSigner, setIsCheckingSigner] = useState<boolean>(false);
  const signerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to create a new managed signer
  const createManagedSigner = async () => {
    if (isCreatingSigner) return;
    
    setIsCreatingSigner(true);
    const toastId = toast.loading("Creating a new signer...");
    
    try {
      // Clear any existing intervals to prevent state conflicts
      if (signerCheckIntervalRef.current) {
        clearInterval(signerCheckIntervalRef.current);
        signerCheckIntervalRef.current = null;
      }
      
      // Clear any previous error state
      setErrorMessage(null);
      
      // Create a new signer
      console.log('[CREATE] Creating new signer');
      const response = await fetch('/api/neynar/signer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create signer: ${JSON.stringify(errorData)}`);
      }
      
      const signer = await response.json();
      console.log('[CREATE] Created new managed signer:', signer);
      
      // Validate that we have a signer UUID
      if (!signer.signer_uuid) {
        throw new Error('Created signer is missing a UUID');
      }
      
      // Store the original signer UUID to ensure we track the right one
      const originalSignerUuid = signer.signer_uuid;
      console.log(`[CREATE] Original signer UUID: ${originalSignerUuid}`);
      
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
      
      toast.success("Signer created successfully!");
      
      // We need to register the signer to get an approval URL
      try {
        console.log('[CREATE] Auto-registering newly created signer...');
        
        // Update toast to show registration in progress
        toast.dismiss(toastId);
        const registerToastId = toast.loading("Getting approval URL...");
        
        console.log(`[CREATE] Calling register-signer with UUID: ${signer.signer_uuid}`);
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
          console.error('[CREATE] Error auto-registering new signer:', await registerResponse.text());
          toast.dismiss(registerToastId);
          toast.error("Could not get approval URL automatically. Will try again in a moment.");
          
          // We can still poll with the original UUID and preserve any state we have
          startSignerApprovalPolling(originalSignerUuid);
          return;
        }
        
        const registeredSigner = await registerResponse.json();
        console.log('[CREATE] Auto-registered signer result:', registeredSigner);
        
        // Validate the registered signer has a UUID
        if (!registeredSigner.signer_uuid) {
          throw new Error('Registered signer is missing a UUID');
        }
        
        // VERY IMPORTANT: Check if the UUID changed during registration
        const didUuidChange = registeredSigner.signer_uuid !== originalSignerUuid;
        console.log(`[CREATE] Did signer UUID change? ${didUuidChange} (Original: ${originalSignerUuid}, New: ${registeredSigner.signer_uuid})`);
        
        // Dismiss the registration toast
        toast.dismiss(registerToastId);
        
        // Update the managed signer with the response from registration
        // This is CRITICAL: we must use the NEW UUID from registration
        const updatedSigner: ManagedSigner = {
          ...signer, // Base on original signer
          signer_uuid: registeredSigner.signer_uuid, // Use the NEW UUID
          public_key: registeredSigner.public_key || signer.public_key,
          status: 'pending_approval',
          signer_approval_url: registeredSigner.signer_approval_url
        };
        
        console.log('[CREATE] Updated signer with registration data:', updatedSigner);
        
        // Update state with new UUID and keep approval URL
        setManagedSigner(updatedSigner);
        
        // Save to localStorage with the new UUID
        localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
        
        // Start polling with the NEW signer UUID
        console.log(`[CREATE] Starting polling with the NEW UUID: ${registeredSigner.signer_uuid}`);
        startSignerApprovalPolling(registeredSigner.signer_uuid);
      } catch (regError) {
        console.error('[CREATE] Error in auto-registration:', regError);
        toast.error("Registration error. Will try again automatically.");
        // Fall back to normal polling with original UUID
        console.log(`[CREATE] Starting polling with original UUID after error: ${originalSignerUuid}`);
        startSignerApprovalPolling(originalSignerUuid);
      }
    } catch (error) {
      console.error('[CREATE] Error creating managed signer:', error);
      toast.error(`Failed to create signer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create signer');
    } finally {
      toast.dismiss(toastId);
      setIsCreatingSigner(false);
    }
  };
  
  // Function to manually trigger signer registration
  const triggerManualRegistration = async () => {
    if (!managedSigner?.signer_uuid) {
      toast.error("No signer UUID available");
      return;
    }
    
    const toastId = toast.loading("Registering signer...");
    
    try {
      // Clear any error state
      setErrorMessage(null);
      
      // Store the current approval URL in case we need to preserve it
      const currentApprovalUrl = managedSigner.signer_approval_url;
      
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
        toast.error("Failed to register: " + errorText);
        
        // If registration fails but we had an approval URL, preserve it
        if (currentApprovalUrl) {
          console.log('Preserving existing approval URL after registration failure');
          // Keep existing approval URL in case of failure
          setManagedSigner(prev => ({
            ...prev!,
            signer_approval_url: currentApprovalUrl
          }));
        }
        
        return;
      }
      
      const data = await response.json();
      console.log('Manual registration result:', data);
      
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
        
        toast.success("Successfully got approval URL!");
        
        // Restart polling with the new signer UUID
        // First clear any existing interval
        if (signerCheckIntervalRef.current) {
          clearInterval(signerCheckIntervalRef.current);
          signerCheckIntervalRef.current = null;
        }
        
        startSignerApprovalPolling(data.signer_uuid);
      } else {
        // No approval URL was returned, but we might have had one before
        toast.error("No approval URL returned");
        
        // If we had an approval URL before, preserve it
        if (currentApprovalUrl) {
          console.log('No new approval URL received, preserving existing one');
          setManagedSigner(prev => ({
            ...prev!,
            signer_approval_url: currentApprovalUrl
          }));
        }
      }
    } catch (error) {
      console.error('Error in manual registration:', error);
      toast.error("Registration failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      toast.dismiss(toastId);
    }
  };
  
  // Function to start polling for signer approval
  const startSignerApprovalPolling = (signerUuid: string) => {
    // Safety check - don't start polling without a valid UUID
    if (!signerUuid) {
      console.error('[POLLING] Cannot start polling without a valid signer UUID');
      toast.error('Connection error. Please try again.');
      return;
    }

    // Check if we already have an approved signer - if so, don't start polling
    if (managedSigner?.status === 'approved') {
      console.log('[POLLING] Signer is already approved, skipping polling');
      return;
    }

    // Clear any existing interval
    if (signerCheckIntervalRef.current) {
      clearInterval(signerCheckIntervalRef.current);
      signerCheckIntervalRef.current = null;
      console.log('[POLLING] Cleared existing polling interval');
    }
    
    console.log('[POLLING] Setting isCheckingSigner to TRUE');
    setIsCheckingSignerSafely(true);
    console.log('[POLLING] Starting polling for signer:', signerUuid);
    
    // Track consecutive errors
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    
    // Wrap the entire polling function in a try-catch to ensure the interval survives any errors
    const pollFunction = async () => {
      // Track when this poll happened for health checking
      window._lastPollTimestamp = Date.now();
      
      // Track when we start this polling iteration
      const iterationStartTime = Date.now();
      console.log(`[POLLING] Poll iteration started at ${new Date().toISOString()}`);
      
      try {
        // Store the current signer UUID we're going to check - use the passed UUID as fallback
        const signerUuidToCheck = managedSigner?.signer_uuid || signerUuid;
        console.log(`[POLLING] Using signer UUID for this poll: ${signerUuidToCheck}`);
        
        if (!signerUuidToCheck) {
          console.error("[ERROR] No signer UUID available for polling");
          // We'll still continue the polling interval but skip this iteration
          return;
        }

        // Use our improved signer-status endpoint with no caching
        const response = await fetch(`/api/neynar/signer-status?signer_uuid=${signerUuidToCheck}`, {
          method: 'GET',
          cache: 'no-store'
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[POLLING] Error checking signer status (${response.status}): ${errorText}`);
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error(`[POLLING] Reached ${MAX_CONSECUTIVE_ERRORS} consecutive errors, but will continue polling`);
            // We won't clear the interval, just log the error
          }
          return; // Return early but don't stop polling
        }
        
        // Reset consecutive errors on success
        consecutiveErrors = 0;
        
        const signer = await response.json();
        console.log('[POLLING] Signer status check result:', JSON.stringify(signer));
        
        // Add debugging for current state
        console.log('[POLLING] BEFORE UPDATE - Current managedSigner state:', 
          managedSigner ? JSON.stringify({
            signer_uuid: managedSigner.signer_uuid,
            status: managedSigner.status,
            has_url: !!managedSigner.signer_approval_url,
            fid: managedSigner.fid
          }) : 'null');
        
        // Check if the response contains error or if essential properties are missing
        if (signer.error || (!signer.status && !signer.signer_uuid)) {
          console.error('[POLLING] Invalid signer response:', JSON.stringify(signer));
          return; // Return early but don't stop polling
        }
        
        // Create a defensive default state if managedSigner is null
        const currentSigner = managedSigner || {
          signer_uuid: signerUuidToCheck, // Use the UUID we're currently polling with
          public_key: '',
          status: 'pending_approval' as const,
          signer_approval_url: '',
          fid: undefined
        };
        
        // Get the previous status to detect transitions
        const previousStatus = currentSigner.status;
        
        // CRITICALLY IMPORTANT: Use the snapshot from the start of this iteration
        // This prevents any race conditions where the state might have changed
        const currentApprovalUrl = currentSigner.signer_approval_url || '';
        
        // Create a proper update that preserves important data
        const updatedSigner = {
          ...currentSigner,
          // Ensure we always have a signer_uuid - NEVER allow this to be undefined or null
          signer_uuid: signer.signer_uuid || currentSigner.signer_uuid || signerUuidToCheck,
          public_key: signer.public_key || currentSigner.public_key || '',
          // IMPORTANT: Check explicitly for "approved" status from the API response
          status: signer.status === 'approved' ? 'approved' : 'pending_approval',
          // CRITICAL: Always preserve the approval URL if it's missing in the response
          signer_approval_url: signer.signer_approval_url || currentApprovalUrl || currentSigner.signer_approval_url || '',
          fid: signer.fid || currentSigner.fid
        };
        
        // Always ensure we keep the QR code URL in the state
        setManagedSigner(updatedSigner);
        
        // Also update localStorage to ensure data persistence
        localStorage.setItem('neynar_auth_data', JSON.stringify(updatedSigner));
        
        // Debug the updated state
        console.log('[POLLING] AFTER UPDATE - Updated managedSigner:', JSON.stringify({
          signer_uuid: updatedSigner.signer_uuid,
          status: updatedSigner.status,
          has_url: !!updatedSigner.signer_approval_url,
          url_length: updatedSigner.signer_approval_url?.length,
          fid: updatedSigner.fid
        }));
        
        // If the signer is approved, we can stop polling and update the state
        if (signer.status === 'approved') {
          console.log('[POLLING] SIGNER IS APPROVED! 🎉 Stopping polling');
          if (signerCheckIntervalRef.current) {
            clearInterval(signerCheckIntervalRef.current);
            signerCheckIntervalRef.current = null;
          }
          
          console.log('[POLLING] Setting isCheckingSigner to FALSE');
          setIsCheckingSignerSafely(false);
          
          // Only show the toast if we've transitioned from pending to approved
          // This prevents showing the toast every time the component loads with an already approved signer
          if (previousStatus === 'pending_approval') {
            console.log('[POLLING] Status changed from pending to approved, showing success toast');
            toast.success('Farcaster connection approved!');
          }
          
          // Set the signer UUID for API calls
          setNeynarSignerUuid(signer.signer_uuid);
          
          // If we have an FID, fetch the user's profile
          if (signer.fid) {
            fetchUserProfilePicture(signer.fid);
          }
        } else {
          console.log(`[POLLING] Signer not yet approved, continuing to poll. Current status: ${signer.status}`);
        }
        
        // Handle failed/rejected status, but DON'T remove QR code
        if (signer.status === 'failed' || signer.status === 'rejected') {
          console.log('[POLLING] Signer status is failed/rejected but keeping QR code visible');
          toast.error('Connection approval failed. Please try scanning the QR code again.');
          // Note: We're NOT clearing the interval here to allow retries
        }
      } catch (error) {
        consecutiveErrors++;
        console.error('[POLLING] Error in polling function:', error);
        
        // Even if we have errors, we want to continue polling
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`[POLLING] Reached ${MAX_CONSECUTIVE_ERRORS} consecutive errors, but will continue polling`);
        }
      } finally {
        // Log how long this iteration took
        const iterationTime = Date.now() - iterationStartTime;
        console.log(`[POLLING] Poll iteration completed in ${iterationTime}ms`);
      }
    };
    
    // Start polling immediately
    pollFunction();
    
    // Then set up interval with our wrapped poll function
    signerCheckIntervalRef.current = setInterval(pollFunction, 3000);
    
    console.log(`[POLLING] Polling interval set: ${typeof signerCheckIntervalRef.current} ${signerCheckIntervalRef.current ? '(valid)' : '(invalid)'}`);
    
    // Schedule a check after 10 seconds to verify polling is still active
    setTimeout(() => {
      console.log(`[POLLING-CHECK] After 10s: Is polling active? ${signerCheckIntervalRef.current ? 'YES' : 'NO'}`);
      if (!signerCheckIntervalRef.current) {
        console.log('[POLLING-CHECK] Polling is not active. Attempting to restart...');
        startSignerApprovalPolling(signerUuid);
      }
    }, 10000);
    
    // Schedule another check after 30 seconds
    setTimeout(() => {
      console.log(`[POLLING-CHECK] After 30s: Is polling active? ${signerCheckIntervalRef.current ? 'YES' : 'NO'}`);
      if (!signerCheckIntervalRef.current) {
        console.log('[POLLING-CHECK] Polling is not active. Attempting to restart...');
        startSignerApprovalPolling(signerUuid);
      }
    }, 30000);
  };
  
  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (signerCheckIntervalRef.current) {
        console.log('[POLLING] Cleaning up polling interval on unmount');
        clearInterval(signerCheckIntervalRef.current);
        signerCheckIntervalRef.current = null;
      }
    };
  }, []);
  
  // After the other useEffect hooks, add this one to track isCheckingSigner changes
  useEffect(() => {
    console.log('[STATUS] isCheckingSigner changed to:', isCheckingSigner);
  }, [isCheckingSigner]);

  // Use this effect to log the important values on each render
  useEffect(() => {
    console.log('Render evaluation:', {
      isAuthenticated,
      managedSignerStatus: managedSigner?.status,
      managedSignerFid: managedSigner?.fid,
      isCheckingSigner,
      conditionResult: managedSigner?.status === 'approved' || (managedSigner?.status === 'unknown' && managedSigner?.fid)
    });
  }, [isAuthenticated, managedSigner?.status, managedSigner?.fid, isCheckingSigner]);

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
            
            // Only start polling if signer exists, is pending approval, and has a UUID
            if (signer.status === 'pending_approval' && signer.signer_uuid) {
              console.log('[STORED-SIGNER] Starting polling for pending signer');
              startSignerApprovalPolling(signer.signer_uuid);
            } else if (signer.status === 'approved') {
              console.log('[STORED-SIGNER] Signer already approved, not starting polling');
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

  // Replace the existing useEffect for polling health check with this improved version
  useEffect(() => {
    // Setup a heartbeat to check that polling is active
    const pollHealthCheckInterval = setInterval(() => {
      // Only proceed if we have a managed signer
      if (managedSigner) {
        // Check if the signer is in pending_approval state
        if (managedSigner.status === 'pending_approval') {
          // First check: Is polling active via the interval?
          const isPollingActive = signerCheckIntervalRef.current !== null;
          
          // Second check: When was the last poll?
          const lastPollTime = window._lastPollTimestamp || 0;
          const timeSinceLastPoll = Date.now() - lastPollTime;
          
          // Log the current state with detailed info
          console.log(`[POLLING-HEARTBEAT] Status: ${isPollingActive ? 'ACTIVE' : 'INACTIVE'}, Signer status: ${managedSigner.status}`);
          console.log(`[POLLING-HEARTBEAT] Time since last poll: ${timeSinceLastPoll}ms`);
          
          // Get a valid UUID to use for polling - critical check
          const validUuid = managedSigner.signer_uuid;
          
          // Check if we need to restart polling
          const needsRestart = 
            // Polling is not active but should be
            (!isPollingActive && managedSigner.status === 'pending_approval') ||
            // OR polling is active but hasn't run in over 10 seconds (stuck?)
            (isPollingActive && timeSinceLastPoll > 10000);
          
          if (needsRestart && validUuid) {
            console.log('[POLLING-HEARTBEAT] Polling needs restart. Restarting with UUID:', validUuid);
            
            // Clean up any existing interval
            if (signerCheckIntervalRef.current) {
              clearInterval(signerCheckIntervalRef.current);
              signerCheckIntervalRef.current = null;
            }
            
            // Restart polling with the valid UUID
            startSignerApprovalPolling(validUuid);
          } else if (needsRestart && !validUuid) {
            console.error('[POLLING-HEARTBEAT] Polling needs restart but no valid UUID available');
            // Try to recover from localStorage
            try {
              const savedData = localStorage.getItem('neynar_auth_data');
              if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.signer_uuid) {
                  console.log('[POLLING-HEARTBEAT] Recovered UUID from localStorage:', parsedData.signer_uuid);
                  startSignerApprovalPolling(parsedData.signer_uuid);
                }
              }
            } catch (e) {
              console.error('[POLLING-HEARTBEAT] Error recovering UUID from localStorage:', e);
            }
          }
        } else if (managedSigner.status === 'approved') {
          // If the signer is approved, make sure polling is stopped
          if (signerCheckIntervalRef.current) {
            console.log('[POLLING-HEARTBEAT] Signer is approved but polling is still active. Stopping polling.');
            clearInterval(signerCheckIntervalRef.current);
            signerCheckIntervalRef.current = null;
          }
        }
      }
    }, 5000); // Check every 5 seconds
    
    return () => {
      clearInterval(pollHealthCheckInterval);
    };
  }, [managedSigner?.status, managedSigner?.signer_uuid]);

  // Modification to isCheckingSigner state setting to be defensive
  const setIsCheckingSignerSafely = (value: boolean) => {
    console.log(`[POLLING-SAFETY] Setting isCheckingSigner to ${value}`);
    setIsCheckingSigner(value);
    // If setting to true and we have a pending signer, ensure polling is active
    if (value === true && managedSigner?.status === 'pending_approval' && managedSigner?.signer_uuid) {
      if (!signerCheckIntervalRef.current) {
        console.log('[POLLING-SAFETY] Detected polling should be active but interval is null. Restarting polling.');
        startSignerApprovalPolling(managedSigner.signer_uuid);
      }
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
                {/* First check if there's no managed signer or the signer is still in generated state */}
                {(!managedSigner?.status) || (managedSigner?.status === 'generated') ? (
                  <>
                    <h3 className="text-xl font-medium mb-3 text-white">Connect Farcaster</h3>
                    <p className="text-slate-300 mb-4 text-sm">
                      Connect your Farcaster account to update your profile picture.
                    </p>
                    <div className="w-full space-y-3">
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
                            Creating Connection...
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
                ) : managedSigner?.status === 'pending_approval' || managedSigner?.signer_approval_url ? (
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
                        <div className="mt-3 p-2 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                          <p className="text-sm text-blue-300 flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Waiting for approval... This page will update automatically.
                          </p>
                        </div>
                      )}
                      {!managedSigner.signer_approval_url && (
                        <div className="flex flex-col items-center my-4">
                          <p className="text-orange-400 text-sm mb-3">
                            Waiting for connection link to be generated...
                          </p>
                          <button
                            className="py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all text-sm"
                            onClick={triggerManualRegistration}
                          >
                            Try again
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (managedSigner?.status === 'approved' || 
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
                        Something went wrong with your Farcaster connection. Please try again.
                      </p>
                      <button
                        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                        onClick={() => {
                          console.log('[TRY-AGAIN] Try Again button clicked');
                          
                          // First, ensure any existing polling is stopped
                          if (signerCheckIntervalRef.current) {
                            console.log('[TRY-AGAIN] Clearing existing polling interval');
                            clearInterval(signerCheckIntervalRef.current);
                            signerCheckIntervalRef.current = null;
                          }
                          
                          // First try to see if we can recover from localStorage
                          try {
                            console.log('[TRY-AGAIN] Checking localStorage for saved data');
                            const savedData = localStorage.getItem('neynar_auth_data');
                            if (savedData) {
                              const parsedData = JSON.parse(savedData);
                              if (parsedData.signer_approval_url) {
                                console.log('[TRY-AGAIN] Recovered approval URL from localStorage:', parsedData.signer_approval_url);
                                // We have a saved approval URL - use it instead of clearing everything
                                const updatedSigner = {
                                  ...parsedData,
                                  status: 'pending_approval' // Force pending_approval status
                                };
                                
                                // Update the state with recovered data
                                setManagedSigner(updatedSigner);
                                
                                // Make sure isCheckingSigner is set to true to show the waiting message
                                console.log('[TRY-AGAIN] Setting isCheckingSigner to TRUE');
                                setIsCheckingSignerSafely(true);
                                
                                // Start polling with the recovered signer UUID
                                if (parsedData.signer_uuid) {
                                  console.log('[TRY-AGAIN] Starting polling with recovered UUID');
                                  // Use setTimeout to ensure state is updated before polling starts
                                  setTimeout(() => {
                                    startSignerApprovalPolling(parsedData.signer_uuid);
                                  }, 100);
                                }
                                return; // Skip the reset
                              }
                            }
                          } catch (e) {
                            console.error('[TRY-AGAIN] Error trying to recover from localStorage:', e);
                          }
                          
                          // If recovery failed, do a full reset
                          console.log('[TRY-AGAIN] Recovery failed, performing full reset');
                          localStorage.removeItem('neynar_auth_data');
                          localStorage.removeItem('neynar_auth_success');
                          
                          // Reset state safely
                          setManagedSigner(null);
                          setIsCheckingSignerSafely(false); // Reset this flag
                          setErrorMessage(null); // Clear any error messages
                          
                          // Create a new managed signer after a short delay to ensure state is updated
                          console.log('[TRY-AGAIN] Creating new managed signer after reset');
                          setTimeout(() => {
                            createManagedSigner();
                          }, 200);
                        }}
                      >
                        Try Again
                      </button>
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