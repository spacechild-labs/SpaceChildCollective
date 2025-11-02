import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  Key, 
  Plus, 
  Settings, 
  TestTube, 
  Trash2, 
  Edit, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  DollarSign,
  Activity
} from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  isActive: boolean;
  createdAt: string;
  lastUsed: string;
  usageCount: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

interface UsageStats {
  providerName: string;
  tokensUsed: number;
  requestsCount: number;
  cost: number;
  lastUsed: string;
}

interface ProviderSuggestion {
  name: string;
  baseUrl?: string;
  models: string[];
  rateLimit?: { requestsPerMinute: number; tokensPerMinute: number };
  instructions: string;
}

export function AIKeyManager() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [suggestions, setSuggestions] = useState<ProviderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    apiKey: '',
    baseUrl: '',
    models: [] as string[],
    isActive: true,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 10000
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [providersRes, usageRes, suggestionsRes] = await Promise.all([
        fetch('/api/ai-keys/providers'),
        fetch('/api/ai-keys/usage'),
        fetch('/api/ai-keys/suggestions')
      ]);

      if (providersRes.ok) {
        const providersData = await providersRes.json();
        setProviders(providersData);
      }

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsageStats(usageData);
      }

      if (suggestionsRes.ok) {
        const suggestionsData = await suggestionsRes.json();
        setSuggestions(suggestionsData);
      }
    } catch (error) {
      console.error('Failed to load AI key data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingProvider 
        ? `/api/ai-keys/providers/${editingProvider.id}`
        : '/api/ai-keys/providers';
      
      const method = editingProvider ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadData();
        setShowAddDialog(false);
        setEditingProvider(null);
        resetForm();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to save provider:', error);
      alert('Failed to save provider');
    }
  };

  const testProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    
    try {
      const response = await fetch(`/api/ai-keys/providers/${providerId}/test`, {
        method: 'POST'
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ Connection test successful!\nProvider: ${result.provider}\nModel: ${result.model}`);
      } else {
        alert(`❌ Connection test failed: ${result.details}`);
      }
    } catch (error) {
      console.error('Test failed:', error);
      alert('❌ Connection test failed');
    } finally {
      setTestingProvider(null);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to remove this AI provider?')) return;
    
    try {
      const response = await fetch(`/api/ai-keys/providers/${providerId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadData();
      } else {
        alert('Failed to remove provider');
      }
    } catch (error) {
      console.error('Failed to delete provider:', error);
      alert('Failed to remove provider');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      apiKey: '',
      baseUrl: '',
      models: [],
      isActive: true,
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 10000
      }
    });
  };

  const startEdit = (provider: AIProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      apiKey: '', // Don't populate for security
      baseUrl: provider.baseUrl || '',
      models: provider.models,
      isActive: provider.isActive,
      rateLimit: provider.rateLimit || {
        requestsPerMinute: 60,
        tokensPerMinute: 10000
      }
    });
    setShowAddDialog(true);
  };

  const totalUsage = usageStats.reduce((acc, stat) => ({
    tokensUsed: acc.tokensUsed + stat.tokensUsed,
    requestsCount: acc.requestsCount + stat.requestsCount,
    cost: acc.cost + stat.cost
  }), { tokensUsed: 0, requestsCount: 0, cost: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Key Management</h2>
          <p className="text-muted-foreground">
            Manage your AI provider API keys for research processing
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {providers.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No AI providers configured. Add your API keys to enable AI-powered research features.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="usage">Usage Statistics</TabsTrigger>
          <TabsTrigger value="setup">Setup Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4">
            {providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    <CardTitle className="text-lg">{provider.name}</CardTitle>
                    <Badge variant={provider.isActive ? 'default' : 'secondary'}>
                      {provider.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testProvider(provider.id)}
                      disabled={testingProvider === provider.id}
                    >
                      {testingProvider === provider.id ? (
                        <div className="animate-spin h-4 w-4 border-b-2 border-blue-600"></div>
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(provider)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteProvider(provider.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      Used {provider.usageCount} times • Last used {new Date(provider.lastUsed).toLocaleDateString()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {provider.models.map((model) => (
                        <Badge key={model} variant="outline" className="text-xs">
                          {model}
                        </Badge>
                      ))}
                    </div>
                    {provider.rateLimit && (
                      <div className="text-xs text-muted-foreground">
                        Rate limit: {provider.rateLimit.requestsPerMinute} req/min, {provider.rateLimit.tokensPerMinute} tokens/min
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUsage.tokensUsed.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Across all providers
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUsage.requestsCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  API calls made
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalUsage.cost.toFixed(4)}</div>
                <p className="text-xs text-muted-foreground">
                  Estimated cost
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {usageStats.map((stat) => (
              <Card key={stat.providerName}>
                <CardHeader>
                  <CardTitle className="text-lg">{stat.providerName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Tokens Used</Label>
                      <div className="text-lg font-semibold">{stat.tokensUsed.toLocaleString()}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Requests</Label>
                      <div className="text-lg font-semibold">{stat.requestsCount.toLocaleString()}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Cost</Label>
                      <div className="text-lg font-semibold">${stat.cost.toFixed(4)}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Last Used</Label>
                      <div className="text-lg font-semibold">{new Date(stat.lastUsed).toLocaleDateString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              This platform supports Bring Your Own AI Keys. Add your API keys from any supported provider to enable AI features.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {suggestions.map((suggestion, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {suggestion.name}
                  </CardTitle>
                  <CardDescription>{suggestion.instructions}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium">Available Models ({suggestion.models.length})</Label>
                      <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                        <div className="grid gap-1 text-xs">
                          {suggestion.models.map((model) => (
                            <div key={model} className="font-mono text-gray-700 hover:bg-gray-100 px-1 py-0.5 rounded">
                              {model}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {suggestion.rateLimit && (
                      <div>
                        <Label className="text-sm font-medium">Rate Limits</Label>
                        <div className="text-sm text-muted-foreground">
                          {suggestion.rateLimit.requestsPerMinute} requests/minute, {suggestion.rateLimit.tokensPerMinute.toLocaleString()} tokens/minute
                        </div>
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium">Base URL</Label>
                      <div className="text-sm text-muted-foreground font-mono break-all">
                        {suggestion.baseUrl}
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      💡 <strong>Tip:</strong> {suggestion.name} offers {suggestion.models.length} different models for various use cases
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? 'Edit AI Provider' : 'Add AI Provider'}
            </DialogTitle>
            <DialogDescription>
              Configure your AI provider settings to enable research processing
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Provider Name</Label>
                <Select value={formData.name} onValueChange={(value) => setFormData(prev => ({ ...prev, name: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OpenAI">OpenAI</SelectItem>
                    <SelectItem value="Anthropic">Anthropic</SelectItem>
                    <SelectItem value="Google">Google</SelectItem>
                    <SelectItem value="OpenRouter">OpenRouter</SelectItem>
                    <SelectItem value="Custom">Custom Provider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Enter your API key"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="baseUrl">Base URL (Optional)</Label>
              <Input
                id="baseUrl"
                value={formData.baseUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <div>
              <Label htmlFor="models">Models (comma-separated)</Label>
              <Input
                id="models"
                value={formData.models.join(', ')}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  models: e.target.value.split(',').map(m => m.trim()).filter(m => m)
                }))}
                placeholder="gpt-4, gpt-4-turbo-preview, gpt-3.5-turbo"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="requestsPerMinute">Requests per minute</Label>
                <Input
                  id="requestsPerMinute"
                  type="number"
                  value={formData.rateLimit.requestsPerMinute}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    rateLimit: { ...prev.rateLimit, requestsPerMinute: parseInt(e.target.value) || 60 }
                  }))}
                />
              </div>
              
              <div>
                <Label htmlFor="tokensPerMinute">Tokens per minute</Label>
                <Input
                  id="tokensPerMinute"
                  type="number"
                  value={formData.rateLimit.tokensPerMinute}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    rateLimit: { ...prev.rateLimit, tokensPerMinute: parseInt(e.target.value) || 10000 }
                  }))}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProvider ? 'Update Provider' : 'Add Provider'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
