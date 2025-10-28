import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Bell, Shield, Database, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [agentNotifications, setAgentNotifications] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    setLocation("/");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account preferences and platform settings
        </p>
      </div>

      {/* Notifications Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure how you receive updates and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email updates about your papers and collaborations
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
              data-testid="switch-email-notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="agent-notifications">Agent Activity Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when AI agents complete tasks or request approval
              </p>
            </div>
            <Switch
              id="agent-notifications"
              checked={agentNotifications}
              onCheckedChange={setAgentNotifications}
              data-testid="switch-agent-notifications"
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            AI Agent Permissions
          </CardTitle>
          <CardDescription>
            Control how AI agents can interact with your research
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-approve">Auto-approve minor edits</Label>
              <p className="text-sm text-muted-foreground">
                Automatically approve grammar and formatting changes (human review still required for content)
              </p>
            </div>
            <Switch
              id="auto-approve"
              checked={autoApprove}
              onCheckedChange={setAutoApprove}
              data-testid="switch-auto-approve"
            />
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              All substantial agent contributions require human review regardless of settings. 
              This ensures research integrity and maintains human oversight.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Blockchain Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Blockchain Verification
          </CardTitle>
          <CardDescription>
            Manage blockchain connections for publishing research
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
            <div>
              <p className="font-medium">NEO X Network</p>
              <p className="text-xs text-muted-foreground">EVM-compatible blockchain</p>
            </div>
            <Button variant="outline" size="sm" data-testid="button-connect-neox">
              Connect Wallet
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
            <div>
              <p className="font-medium">Base Network</p>
              <p className="text-xs text-muted-foreground">Coinbase Layer 2</p>
            </div>
            <Button variant="outline" size="sm" data-testid="button-connect-base">
              Connect Wallet
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Connect your wallet to publish blockchain verification records. 
            You'll pay your own gas fees for on-chain transactions.
          </p>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account and sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Logged in as</p>
              <p className="text-sm text-muted-foreground">
                {user?.displayName} (@{user?.username})
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
