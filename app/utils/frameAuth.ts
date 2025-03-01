// Define the structure of a signed message response
export interface SignedMessageResponse {
  signature: string;
  message: string;
}

/**
 * Gets authentication from a frame context
 * This uses the newer managed signers approach
 */
export function getFrameAuthentication(fid: number) {
  return {
    // Function to sign messages using the frame context
    signMessage: async (message: string): Promise<SignedMessageResponse | null> => {
      try {
        // Here we would use Neynar's managed signers
        // This is a simpler approach than using the frame's signMessage directly
        
        // First check if we have a stored signer UUID for this FID
        const storedData = localStorage.getItem(`neynar_auth_data`);
        if (!storedData) {
          console.error('No authentication data found');
          return null;
        }
        
        // Parse the stored data
        const authData = JSON.parse(storedData);
        const signerUuid = authData?.signer_uuid;
        
        if (!signerUuid) {
          console.error('No signer UUID found in auth data');
          return null;
        }
        
        // Make a request to sign the message with our managed signer
        const response = await fetch('/api/neynar/sign-message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            signerUuid,
            fid,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to sign message: ${error.message || response.statusText}`);
        }
        
        const signedMessage = await response.json();
        return signedMessage;
      } catch (error) {
        console.error('Error signing message:', error);
        return null;
      }
    }
  };
} 