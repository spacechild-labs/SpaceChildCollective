# Research Registry Smart Contract Deployment Guide

## Contract Overview

`ResearchRegistry.sol` is a simple, gas-efficient smart contract for verifying research papers on-chain. It stores paper hashes and metadata, enabling trustless verification of publication timestamps.

## Features

- ✅ Publish papers with content hash, title, and metadata URI
- ✅ Verify paper existence and authenticity
- ✅ Track publisher history
- ✅ Event emission for indexing and tracking
- ✅ Minimal gas usage

## Deployment Networks

### 1. NEO X Testnet

**Network Details:**
- Chain ID: `12227332`
- RPC URL: `https://neoxt4seed1.ngd.network`
- Explorer: https://xt4scan.ngd.network
- Native Token: GAS

**Steps to Deploy:**
1. Get testnet GAS from NEO X faucet
2. Deploy `ResearchRegistry.sol` using Remix, Hardhat, or Foundry
3. Verify contract on xt4scan.ngd.network
4. Note the deployed contract address

### 2. Base Network

**Option A: Base Sepolia Testnet (Recommended for Testing)**
- Chain ID: `84532`
- RPC URL: `https://sepolia.base.org`
- Explorer: https://sepolia.basescan.org
- Native Token: ETH
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

**Option B: Base Mainnet (Production)**
- Chain ID: `8453`
- RPC URL: `https://mainnet.base.org`
- Explorer: https://basescan.org
- Native Token: ETH

**Steps to Deploy:**
1. Get testnet ETH from Base Sepolia faucet (or use mainnet ETH)
2. Deploy `ResearchRegistry.sol`
3. Verify contract on basescan.org
4. Note the deployed contract address

## Deployment Tools

### Option 1: Remix IDE (Easiest - No Code Required)

1. Go to https://remix.ethereum.org
2. Create new file: `ResearchRegistry.sol`
3. Paste the contract code
4. Compile with Solidity 0.8.20+
5. Deploy using MetaMask:
   - Connect to NEO X Testnet (add network to MetaMask)
   - Deploy contract
   - Copy contract address
6. Repeat for Base network

### Option 2: Hardhat (Recommended for Developers)

```bash
# Install Hardhat
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Create Hardhat project
npx hardhat init

# Add contract to contracts/ResearchRegistry.sol

# Configure networks in hardhat.config.js:
module.exports = {
  solidity: "0.8.20",
  networks: {
    neoXTestnet: {
      url: "https://neoxt4seed1.ngd.network",
      chainId: 12227332,
      accounts: [process.env.PRIVATE_KEY]
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      chainId: 84532,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};

# Deploy to NEO X Testnet
npx hardhat run scripts/deploy.js --network neoXTestnet

# Deploy to Base Sepolia
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Option 3: Foundry (Fastest for Experienced Users)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Create project
forge init research-registry
cd research-registry

# Add contract to src/ResearchRegistry.sol

# Deploy to NEO X Testnet
forge create --rpc-url https://neoxt4seed1.ngd.network \
  --private-key $PRIVATE_KEY \
  src/ResearchRegistry.sol:ResearchRegistry

# Deploy to Base Sepolia
forge create --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  src/ResearchRegistry.sol:ResearchRegistry
```

## Contract Verification

After deployment, verify your contracts on the respective block explorers to enable public interaction:

### NEO X Explorer Verification
1. Go to https://xt4scan.ngd.network
2. Find your contract address
3. Click "Verify & Publish"
4. Enter contract details and source code
5. Submit for verification

### Base Explorer Verification
1. Go to https://sepolia.basescan.org (or basescan.org for mainnet)
2. Find your contract address
3. Click "Contract" → "Verify and Publish"
4. Select "Solidity (Single file)"
5. Enter compiler version: v0.8.20+
6. Paste contract source code
7. Submit for verification

## What to Provide After Deployment

Once deployed and verified, provide these details:

```json
{
  "neoX": {
    "address": "0x...", 
    "chainId": 12227332,
    "explorerUrl": "https://xt4scan.ngd.network/address/0x..."
  },
  "base": {
    "address": "0x...",
    "chainId": 84532,
    "explorerUrl": "https://sepolia.basescan.org/address/0x..."
  }
}
```

**ABI:** Available in compilation artifacts. If using Remix:
- Compile contract
- Click "Compilation Details"
- Copy ABI JSON
- Send the full ABI array

## Gas Estimates

Approximate gas costs (will vary by network):

- **Deploy Contract:** ~500,000-800,000 gas
- **Publish Paper:** ~100,000-150,000 gas
- **Verify Paper:** ~30,000 gas (read-only, no gas on query)
- **Record Verification:** ~50,000 gas

## Testing the Contract

After deployment, test with these function calls:

```solidity
// 1. Publish a paper
publishPaper(
  0x1234567890abcdef...,  // contentHash (32 bytes)
  "My Research Paper",    // title
  "ipfs://Qm..."         // metadataURI
)

// 2. Verify it exists
verifyPaper(0x1234567890abcdef...)
// Returns: (true, 0xPublisherAddress, 1699999999, "My Research Paper")

// 3. Get paper details
getPaper(0x1234567890abcdef...)
// Returns full Paper struct
```

## Security Considerations

✅ **Already Implemented:**
- Hash collision prevention (papers can only be published once)
- Input validation (non-empty strings, valid hashes)
- Publisher tracking for accountability
- Event emission for transparency

⚠️ **Notes:**
- No access control - anyone can publish (public registry)
- No edit/delete functionality (immutable by design)
- Content hash must be calculated off-chain (SHA-256)

## Support

If you encounter issues during deployment:
1. Check network configuration (RPC, Chain ID)
2. Ensure you have native tokens for gas
3. Verify Solidity compiler version (0.8.20+)
4. Test on testnet before mainnet

## Next Steps

After providing contract addresses and ABI:
1. I'll integrate them into the frontend
2. Users will be able to publish papers to blockchain
3. Papers will be verified on both chains
4. Blockchain records will be stored in the database

---

**Questions?** Let me know the contract addresses and I'll complete the integration!
