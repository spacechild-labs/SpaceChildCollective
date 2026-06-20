import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, X, ExternalLink } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { neoXMainnet } from "@/lib/wagmi-config";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const currentChain = chainId === base.id ? "Base" : chainId === neoXMainnet.id ? "NEO X Mainnet" : "Unknown";
  const isCorrectChain = chainId === base.id || chainId === neoXMainnet.id;

  if (isConnected && address) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Connected
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => disconnect()}
              aria-label="Disconnect wallet"
              data-testid="button-disconnect-wallet"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Address</p>
            <p className="font-mono text-sm break-all" data-testid="text-wallet-address">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Network</p>
            <Badge variant={isCorrectChain ? "default" : "destructive"} data-testid="badge-network">
              {currentChain}
            </Badge>
          </div>
          {!isCorrectChain && (
            <div className="pt-2 space-y-2">
              <p className="text-xs text-destructive">Please switch to Base or NEO X Mainnet</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => switchChain({ chainId: base.id })}
                  data-testid="button-switch-base"
                >
                  Switch to Base
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => switchChain({ chainId: neoXMainnet.id })}
                  data-testid="button-switch-neox"
                >
                  Switch to NEO X Mainnet
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5" />
          Connect Wallet
        </CardTitle>
        <CardDescription>
          Connect your wallet to publish research to blockchain
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {connectors.map((connector) => (
          <Button
            key={connector.id}
            variant="outline"
            className="w-full justify-start"
            onClick={() => connect({ connector })}
            disabled={isPending}
            data-testid={`button-connect-${connector.id}`}
          >
            <Wallet className="mr-2 h-4 w-4" />
            {connector.name}
          </Button>
        ))}
        <p className="text-xs text-muted-foreground pt-2">
          You'll pay gas fees for blockchain transactions
        </p>
      </CardContent>
    </Card>
  );
}

interface BlockchainPublishButtonProps {
  paperId: string;
  paperTitle: string;
  paperHash: string;
  onSuccess?: () => void;
}

export function BlockchainPublishButton({
  paperId,
  paperTitle,
  paperHash,
  onSuccess,
}: BlockchainPublishButtonProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // TODO: Implement actual blockchain publishing with contract interaction
  const handlePublish = async () => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first");
      return;
    }

    // Placeholder for actual smart contract interaction
    console.log("Publishing to blockchain:", {
      paperId,
      paperTitle,
      paperHash,
      chain: chainId === base.id ? "Base" : "NEO X",
      wallet: address,
    });

    alert("Blockchain publishing coming soon! This will use your connected wallet to sign the transaction.");
    onSuccess?.();
  };

  return (
    <Button
      onClick={handlePublish}
      disabled={!isConnected}
      data-testid="button-publish-blockchain"
    >
      <ExternalLink className="mr-2 h-4 w-4" />
      Publish to Blockchain
    </Button>
  );
}
