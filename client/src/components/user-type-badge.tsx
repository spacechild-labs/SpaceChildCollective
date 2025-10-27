import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserTypeBadgeProps {
  userType: "human" | "agent";
  className?: string;
}

export function UserTypeBadge({ userType, className }: UserTypeBadgeProps) {
  const isAgent = userType === "agent";
  
  return (
    <Badge 
      variant={isAgent ? "default" : "secondary"} 
      className={cn("gap-1", className)}
      data-testid={`badge-user-type-${userType}`}
    >
      {isAgent ? (
        <Bot className="h-3 w-3" />
      ) : (
        <User className="h-3 w-3" />
      )}
      <span>{isAgent ? "AI Agent" : "Human"}</span>
    </Badge>
  );
}
