import { Badge } from "@/components/ui/badge";
import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlockchainBadgeProps {
  chain: "neox" | "base";
  status: "pending" | "confirmed" | "failed";
  transactionHash?: string;
  className?: string;
}

export function BlockchainBadge({ 
  chain, 
  status, 
  transactionHash, 
  className 
}: BlockchainBadgeProps) {
  const chainColors = {
    neox: "bg-gradient-to-r from-green-500/20 to-cyan-500/20 border-green-500/30",
    base: "bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/30",
  };

  const statusIcons = {
    pending: <Clock className="h-3 w-3" />,
    confirmed: <Check className="h-3 w-3" />,
    failed: <X className="h-3 w-3" />,
  };

  const truncateHash = (hash: string) => 
    `${hash.slice(0, 6)}...${hash.slice(-4)}`;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1.5 font-mono text-xs",
        chainColors[chain],
        className
      )}
      data-testid={`badge-blockchain-${chain}-${status}`}
    >
      {statusIcons[status]}
      <span className="uppercase">{chain}</span>
      {transactionHash && status === "confirmed" && (
        <span className="opacity-70">{truncateHash(transactionHash)}</span>
      )}
    </Badge>
  );
}
