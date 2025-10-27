// Blockchain service for NEO X and Base integration
import { ethers } from "ethers";
import { createHash } from "crypto";

// NEO X Mainnet configuration (EVM-compatible)
const NEOX_RPC = "https://mainnet.neoxt4.neo.org";
const NEOX_CHAIN_ID = 47763;

// Base Mainnet configuration (Coinbase L2)
const BASE_RPC = "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;

export interface BlockchainPublishRequest {
  paperHash: string;
  title: string;
  authors: string[];
  timestamp: Date;
  privateKey: string;
}

export interface BlockchainPublishResult {
  transactionHash: string;
  blockNumber: number;
  chain: "neox" | "base";
  gasUsed: string;
  timestamp: Date;
}

export async function publishToNeoX(request: BlockchainPublishRequest): Promise<BlockchainPublishResult> {
  try {
    const provider = new ethers.JsonRpcProvider(NEOX_RPC, NEOX_CHAIN_ID);
    const wallet = new ethers.Wallet(request.privateKey, provider);

    const metadata = JSON.stringify({
      type: "consciousness_research_discovery",
      paperHash: request.paperHash,
      title: request.title,
      authors: request.authors,
      timestamp: request.timestamp.toISOString(),
      platform: "Space Child Research Collective",
    });

    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      data: ethers.hexlify(ethers.toUtf8Bytes(metadata)),
    });

    const receipt = await tx.wait();
    
    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chain: "neox",
      gasUsed: receipt.gasUsed.toString(),
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error("NEO X publish error:", error);
    throw new Error(`NEO X blockchain publish failed: ${error.message}`);
  }
}

export async function publishToBase(request: BlockchainPublishRequest): Promise<BlockchainPublishResult> {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC, BASE_CHAIN_ID);
    const wallet = new ethers.Wallet(request.privateKey, provider);

    const metadata = JSON.stringify({
      type: "consciousness_research_discovery",
      paperHash: request.paperHash,
      title: request.title,
      authors: request.authors,
      timestamp: request.timestamp.toISOString(),
      platform: "Space Child Research Collective",
    });

    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      data: ethers.hexlify(ethers.toUtf8Bytes(metadata)),
    });

    const receipt = await tx.wait();
    
    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chain: "base",
      gasUsed: receipt.gasUsed.toString(),
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error("Base publish error:", error);
    throw new Error(`Base blockchain publish failed: ${error.message}`);
  }
}

export function generatePaperHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function verifyBlockchainRecord(
  chain: "neox" | "base",
  transactionHash: string
): Promise<boolean> {
  try {
    const provider = chain === "neox"
      ? new ethers.JsonRpcProvider(NEOX_RPC, NEOX_CHAIN_ID)
      : new ethers.JsonRpcProvider(BASE_RPC, BASE_CHAIN_ID);

    const receipt = await provider.getTransactionReceipt(transactionHash);
    return receipt !== null && receipt.status === 1;
  } catch (error) {
    console.error("Blockchain verification error:", error);
    return false;
  }
}

export async function estimateGasCost(
  chain: "neox" | "base",
  dataSize: number
): Promise<{ gasEstimate: string; costInEth: string }> {
  try {
    const provider = chain === "neox"
      ? new ethers.JsonRpcProvider(NEOX_RPC, NEOX_CHAIN_ID)
      : new ethers.JsonRpcProvider(BASE_RPC, BASE_CHAIN_ID);

    const gasPrice = await provider.getFeeData();
    const estimatedGas = 21000 + (dataSize * 16);
    
    const costInWei = BigInt(estimatedGas) * (gasPrice.gasPrice || BigInt(0));
    const costInEth = ethers.formatEther(costInWei);

    return {
      gasEstimate: estimatedGas.toString(),
      costInEth,
    };
  } catch (error) {
    console.error("Gas estimation error:", error);
    return {
      gasEstimate: "Unknown",
      costInEth: "Unknown",
    };
  }
}
