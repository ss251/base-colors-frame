import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { parseAbiItem } from 'viem';

// Contract address for Base Colors from environment variable
const BASE_COLORS_CONTRACT = process.env.NEXT_PUBLIC_BASE_COLORS_CONTRACT as `0x${string}`;
// Provide a dummy fallback API key for testing - should be replaced with a real key in production
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || 'demo';

// Create a public client for Base mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// ABI for the getAttributesAsJson function
const getAttributesAbi = parseAbiItem('function getAttributesAsJson(uint256 tokenId) view returns (string)');

// Function to fetch color name from smart contract
export async function getColorNameFromContract(tokenId: string): Promise<string | null> {
  try {
    // Call the contract's getAttributesAsJson function
    const attributesJson = await publicClient.readContract({
      address: BASE_COLORS_CONTRACT,
      abi: [getAttributesAbi],
      functionName: 'getAttributesAsJson',
      args: [BigInt(tokenId)]
    }) as string;

    // Parse the JSON response
    const attributes = JSON.parse(attributesJson);
    
    // Find the color name attribute
    const colorNameAttribute = attributes.find((attr: { trait_type: string; value: string }) => 
      attr.trait_type === 'Color Name' && attr.value !== tokenId
    );
    
    return colorNameAttribute ? colorNameAttribute.value : null;
  } catch (error) {
    console.error('Error fetching color name from contract:', error);
    return null;
  }
}

export interface BaseColor {
  tokenId: string;
  name: string;
  colorValue: string;
  imageUrl: string;
  properName?: string;
}

interface NFTImage {
  originalUrl: string;
}

interface NFTMetadata {
  tokenId: string;
  name: string;
  image: NFTImage;
  details?: unknown;
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
export async function fetchOwnedBaseColors(address: string): Promise<BaseColor[]> {
  try {
    console.log('Fetching Base Colors for address:', address);
    
    // Check for API key
    if (!ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'demo') {
      console.warn('No Alchemy API key provided. Using fallback demo key. Set NEXT_PUBLIC_ALCHEMY_API_KEY in your environment variables.');
    }
    
    const url = `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner?owner=${address}&contractAddresses[]=${BASE_COLORS_CONTRACT}&withMetadata=true&pageSize=100&tokenUriTimeoutInMs=100`;
    
    console.log('Fetching from Alchemy API');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Alchemy API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Alchemy API response:', data);
    
    const colors: BaseColor[] = [];
    
    // Process each NFT to extract color information
    const promises = data.ownedNfts.map(async (nft: NFTMetadata) => {
      const colorData = await processBaseColorNFT(nft);
      colors.push(colorData);
    });
    
    await Promise.all(promises);
    
    return colors;
  } catch (error) {
    console.error('Error fetching Base Colors:', error);
    throw error;
  }
}

// Helper function to process a single NFT and extract color data
async function processBaseColorNFT(nft: NFTMetadata): Promise<BaseColor> {
  const colorName = nft.name;
  
  // Extract the hex code, removing the # if present
  const hexCode = colorName.startsWith('#') ? colorName : `#${colorName}`;
  
  // For colors with just hex values as names, try to get a proper name from the contract
  let properName = null;
  if (colorName.startsWith('#') && /^#[0-9A-F]{6}$/i.test(colorName)) {
    properName = await getColorNameFromContract(nft.tokenId);
  }
  
  return {
    tokenId: nft.tokenId,
    name: colorName,
    colorValue: hexCode, // Always use the hex code for the color value
    imageUrl: nft.image.originalUrl,
    properName: properName || undefined
  };
}

/**
 * Generate an SVG representing a color
 */
export function generateColorSvg(colorHex: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${colorHex}"/>
  </svg>`;
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