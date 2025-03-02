import { ViemLocalEip712Signer } from "@farcaster/hub-nodejs";
import { bytesToHex, hexToBytes } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import neynarClient from "@/lib/neynarClient";

// Define proper typing for sponsor options
interface NeynarSponsor {
  sponsored_by_neynar: true;
}

interface SelfSponsor {
  sponsored_by_neynar: false;
  signature: string;
  fid: number;
}

type SponsorData = NeynarSponsor | SelfSponsor;

// Function to get FID from mnemonic
export const getFid = async () => {
  if (!process.env.FARCASTER_DEVELOPER_MNEMONIC) {
    throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not set.");
  }

  const account = mnemonicToAccount(process.env.FARCASTER_DEVELOPER_MNEMONIC);

  // Lookup user details using the custody address
  const { user: farcasterDeveloper } =
    await neynarClient.lookupUserByCustodyAddress({ custodyAddress: account.address });

  return Number(farcasterDeveloper.fid);
};

// Function to generate signature
const generateSignature = async (publicKey: string) => {
  if (typeof process.env.FARCASTER_DEVELOPER_MNEMONIC === "undefined") {
    throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not defined");
  }

  const FARCASTER_DEVELOPER_MNEMONIC = process.env.FARCASTER_DEVELOPER_MNEMONIC;
  const FID = await getFid();

  const account = mnemonicToAccount(FARCASTER_DEVELOPER_MNEMONIC);
  // Use proper typing for the signer
  const appAccountKey = new ViemLocalEip712Signer(account);

  // Generates an expiration date for the signature (24 hours from now)
  const deadline = Math.floor(Date.now() / 1000) + 86400;

  const uintAddress = hexToBytes(publicKey as `0x${string}`);

  const signature = await appAccountKey.signKeyRequest({
    requestFid: BigInt(FID),
    key: uintAddress,
    deadline: BigInt(deadline),
  });

  if (signature.isErr()) {
    return {
      deadline,
      signature: "",
    };
  }

  const sigHex = bytesToHex(signature.value);

  return { deadline, signature: sigHex };
};

// Main function to get a signed key
export const getSignedKey = async (sponsor = true, useSelfSponsorship = false) => {
  // Create a signer
  const createSigner = await neynarClient.createSigner();
  
  // Generate signature for the signer
  const { deadline, signature } = await generateSignature(
    createSigner.public_key
  );

  if (deadline === 0 || signature === "") {
    throw new Error("Failed to generate signature");
  }

  const fid = await getFid();
  
  // Handle sponsorship based on parameters
  let sponsorOption: SponsorData | undefined = undefined;
  
  if (sponsor) {
    if (useSelfSponsorship) {
      // We need to generate the sponsor signature
      // This is for apps who want to sponsor directly (requires warps ≥ 100)
      if (typeof process.env.FARCASTER_DEVELOPER_MNEMONIC === "undefined") {
        throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not defined");
      }
      
      const account = mnemonicToAccount(process.env.FARCASTER_DEVELOPER_MNEMONIC);
      // Sign the signature hex as a message
      const sponsorSignature = await account.signMessage({
        message: signature as `0x${string}`,
      });
      
      sponsorOption = {
        sponsored_by_neynar: false,
        signature: sponsorSignature,
        fid: fid,
      };
    } else {
      // Use Neynar to sponsor the signer (charges compute units)
      sponsorOption = {
        sponsored_by_neynar: true
      };
    }
  }

  try {
    // Register the signed key with Neynar
    const signedKey = await neynarClient.registerSignedKey({
      signerUuid: createSigner.signer_uuid,
      signature,
      appFid: fid,
      deadline,
      sponsor: sponsorOption
    });

    return signedKey;
  } catch (error) {
    console.error('Error registering signed key:', error);
    throw error;
  }
}; 