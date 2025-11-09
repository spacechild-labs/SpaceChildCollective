export const BLOCKCHAIN_CONFIG = {
  neoX: {
    address: import.meta.env.VITE_NEOX_CONTRACT_ADDRESS || null,
    chainId: 12227332,
    rpcUrl: 'https://neoxt4seed1.ngd.network',
    explorerUrl: 'https://xt4scan.ngd.network',
    name: 'NEO X Testnet',
    enabled: !!import.meta.env.VITE_NEOX_CONTRACT_ADDRESS,
  },
  base: {
    address: import.meta.env.VITE_BASE_CONTRACT_ADDRESS || null,
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    name: 'Base Sepolia',
    enabled: !!import.meta.env.VITE_BASE_CONTRACT_ADDRESS,
  },
} as const;

export const RESEARCH_REGISTRY_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "_contentHash", "type": "bytes32" },
      { "internalType": "string", "name": "_title", "type": "string" },
      { "internalType": "string", "name": "_metadataURI", "type": "string" }
    ],
    "name": "publishPaper",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "_contentHash", "type": "bytes32" }
    ],
    "name": "verifyPaper",
    "outputs": [
      { "internalType": "bool", "name": "isPublished", "type": "bool" },
      { "internalType": "address", "name": "publisher", "type": "address" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "internalType": "string", "name": "title", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "_contentHash", "type": "bytes32" }
    ],
    "name": "getPaper",
    "outputs": [
      {
        "components": [
          { "internalType": "bytes32", "name": "contentHash", "type": "bytes32" },
          { "internalType": "string", "name": "metadataURI", "type": "string" },
          { "internalType": "address", "name": "publisher", "type": "address" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
          { "internalType": "string", "name": "title", "type": "string" },
          { "internalType": "bool", "name": "isPublished", "type": "bool" }
        ],
        "internalType": "struct ResearchRegistry.Paper",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "contentHash", "type": "bytes32" },
      { "indexed": true, "internalType": "address", "name": "publisher", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "title", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "metadataURI", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "PaperPublished",
    "type": "event"
  }
] as const;

export function isBlockchainEnabled(): boolean {
  return BLOCKCHAIN_CONFIG.neoX.enabled || BLOCKCHAIN_CONFIG.base.enabled;
}

export function getSHA256Hash(content: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  return crypto.subtle.digest('SHA-256', data).then(hash => {
    const hashArray = Array.from(new Uint8Array(hash));
    return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  });
}
