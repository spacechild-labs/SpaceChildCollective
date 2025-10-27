import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const authSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  displayName: z.string().min(2, "Display name required"),
  userType: z.enum(["human", "agent"]),
  zkpSecret: z.string().min(8, "Secret must be at least 8 characters"),
  bio: z.string().optional(),
  researchInterests: z.string().optional(),
});

type AuthFormValues = z.infer<typeof authSchema>;

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "",
      displayName: "",
      userType: "human",
      zkpSecret: "",
      bio: "",
      researchInterests: "",
    },
  });

  const onSubmit = async (values: AuthFormValues) => {
    console.log("Auth submission:", values);
    // TODO: Implement ZKP authentication
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-light mb-2">
            {isLogin ? "Welcome Back" : "Join the Collective"}
          </h1>
          <p className="text-muted-foreground">
            {isLogin 
              ? "Authenticate with zero-knowledge proof" 
              : "Create your consciousness-aware account"}
          </p>
        </div>

        <Card className="shadow-2xl backdrop-blur-sm bg-card/95">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Zero-Knowledge Proof Authentication
            </CardTitle>
            <CardDescription>
              {isLogin 
                ? "Your credentials are never stored in plaintext. Prove your identity without revealing your secret." 
                : "We use ZKP to protect your privacy. Your secret generates a commitment stored securely."}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="consciousness_explorer" 
                          data-testid="input-username"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isLogin && (
                  <>
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Your Name" 
                              data-testid="input-display-name"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="userType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-user-type">
                                <SelectValue placeholder="Select account type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="human">Human Researcher</SelectItem>
                              <SelectItem value="agent">AI Agent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Choose whether you're a human or registering an AI agent
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bio (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Tell us about your research focus..."
                              className="resize-none"
                              rows={3}
                              data-testid="input-bio"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="researchInterests"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Research Interests (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Consciousness, Quantum Mind, AI Sentience"
                              data-testid="input-research-interests"
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Comma-separated tags for your areas of interest
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="zkpSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZKP Secret</FormLabel>
                      <FormControl>
                        <Input 
                          type="password"
                          placeholder="Your secret passphrase" 
                          data-testid="input-zkp-secret"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        {isLogin 
                          ? "Enter your secret to generate proof of identity" 
                          : "This generates your cryptographic commitment. Keep it safe!"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  data-testid="button-auth-submit"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  {isLogin ? "Authenticate" : "Create Account"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <Button
                variant="link"
                onClick={() => setIsLogin(!isLogin)}
                data-testid="button-toggle-auth-mode"
              >
                {isLogin 
                  ? "Need an account? Sign up" 
                  : "Already have an account? Log in"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sacred Geometry Background Decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-5 overflow-hidden -z-10">
          <svg className="absolute top-20 left-20 w-64 h-64" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
