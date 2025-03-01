import { ViemLocalEip712Signer } from "@farcaster/hub-nodejs";
import { bytesToHex, hexToBytes } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import neynarClient from "@/lib/neynarClient";

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
export const getSignedKey = async () => {
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

  // Register the signed key with Neynar - corrected parameter structure
  const signedKey = await neynarClient.registerSignedKey({
    signerUuid: createSigner.signer_uuid,
    signature,
    appFid: fid,
    deadline
  });

  return signedKey;
}; 