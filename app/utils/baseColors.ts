const BASE_COLORS_CONTRACT = process.env.NEXT_PUBLIC_BASE_COLORS_CONTRACT || '0x7Bc1C072742D8391817EB4Eb2317F98dc72C61dB';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';

export interface BaseColor {
  tokenId: string;
  name: string;
  colorValue: string;
  imageUrl: string;
}

// Response type for schedule updates
export interface ScheduleResponse {
  success: boolean;
  message: string;
  scheduledColors?: number;
  error?: string;
  details?: unknown;
}

/**
 * Fetch Base Colors NFTs owned by a given address
 */
export async function fetchOwnedBaseColors(ownerAddress: string): Promise<BaseColor[]> {
  try {
    const url = `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner?owner=${ownerAddress}&contractAddresses[]=${BASE_COLORS_CONTRACT}&withMetadata=true&pageSize=100&tokenUriTimeoutInMs=100`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch NFTs: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Map the response data to our BaseColor interface
    const baseColors: BaseColor[] = data.ownedNfts.map((nft: {
      tokenId: string;
      name: string;
      image: {
        originalUrl: string;
      };
      raw?: {
        metadata?: {
          attributes?: Array<{
            trait_type: string;
            value: string;
          }>;
        };
      };
    }) => {
      // Extract hex code from name (typically "#FFFFFF" format)
      const hexCode = nft.name.startsWith('#') ? nft.name : `#${nft.name}`;
      
      // Try to find a human-readable color name in the attributes
      let colorName = hexCode; // Default to hex code if no other name found
      
      // Check if we have raw metadata with attributes
      if (nft.raw?.metadata?.attributes && Array.isArray(nft.raw.metadata.attributes)) {
        // Look for a color name attribute that isn't just the hex code
        const colorNameAttr = nft.raw.metadata.attributes.find((attr: { trait_type: string; value: string }) => 
          (attr.trait_type === 'Color Name' || attr.trait_type === 'Name') && 
          attr.value && 
          !attr.value.match(/^[A-F0-9]{6}$/i) // Not just a hex code without #
        );
        
        if (colorNameAttr) {
          colorName = colorNameAttr.value;
        }
      }
      
      return {
        tokenId: nft.tokenId,
        name: colorName, // Use the human-readable name if found
        colorValue: hexCode, // Always use the hex code for the color value
        imageUrl: nft.image.originalUrl,
      };
    });
    
    return baseColors;
  } catch (error) {
    console.error('Error fetching Base Colors:', error);
    return [];
  }
}

/**
 * Generate an SVG for a Base Color
 */
export function generateColorSvg(colorHex: string): string {
  // Remove # if present
  const color = colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
  
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${color}"/>
  </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Schedule a profile picture update to cycle through Base Colors
 */
export async function scheduleProfileUpdates(
  fid: number,
  colorIds: number[],
  interval: 'daily' | 'weekly' | 'monthly',
  signerUuid?: string
): Promise<ScheduleResponse> {
  try {
    // If we don't have a signer ID, we can't proceed
    if (!signerUuid) {
      throw new Error('Signer UUID is required to schedule profile updates');
    }

    // Call our API endpoint to schedule updates
    const response = await fetch('/api/schedule-updates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fid,
        colorIds,
        interval,
        signerUuid
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to schedule updates: ${errorData.error || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error scheduling profile updates:', error);
    throw error;
  }
} 