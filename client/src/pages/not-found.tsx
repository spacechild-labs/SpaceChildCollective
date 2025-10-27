import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-display text-6xl font-light mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          This consciousness stream doesn't exist
        </p>
        <Link href="/">
          <Button data-testid="button-home">
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
