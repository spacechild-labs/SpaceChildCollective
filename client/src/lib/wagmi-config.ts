import { createConfig, http } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';

// NEO X Testnet chain config
export const neoXTestnet = {
  id: 12227332,
  name: 'NEO X Testnet',
  nativeCurrency: { name: 'GAS', symbol: 'GAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://neoxt4seed1.ngd.network'] },
  },
  blockExplorers: {
    default: { name: 'NEO X Explorer', url: 'https://xt4scan.ngd.network' },
  },
  testnet: true,
} as const;

export const wagmiConfig = createConfig({
  chains: [base, neoXTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'Space Child Research Collective',
      appLogoUrl: undefined,
    }),
  ],
  transports: {
    [base.id]: http(),
    [neoXTestnet.id]: http(),
  },
});
