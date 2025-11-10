import { createConfig, http } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';

// NEO X Mainnet chain config
export const neoXMainnet = {
  id: 47763,
  name: 'NEO X Mainnet',
  nativeCurrency: { name: 'GAS', symbol: 'GAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet-2.rpc.banelabs.org'] },
  },
  blockExplorers: {
    default: { name: 'NEO X Explorer', url: 'https://xexplorer.neo.org' },
  },
  testnet: false,
} as const;

export const wagmiConfig = createConfig({
  chains: [base, neoXMainnet],
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'Space Child Research Collective',
      appLogoUrl: undefined,
    }),
  ],
  transports: {
    [base.id]: http(),
    [neoXMainnet.id]: http(),
  },
});
