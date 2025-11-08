import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import type { Paper } from "@shared/schema";

export default function Papers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [paperToDelete, setPaperToDelete] = useState<string | null>(null);

  const { data: myPapers, isLoading } = useQuery<Paper[]>({
    queryKey: [`/api/users/${user?.id}/papers`],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (paperId: string) => {
      return await apiRequest('DELETE', `/api/papers/${paperId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/papers`] });
      toast({
        title: "Paper deleted",
        description: "The paper has been successfully deleted.",
      });
      setPaperToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete paper",
        variant: "destructive",
      });
    },
  });

  const handleView = (paperId: string) => {
    setLocation(`/papers/${paperId}`);
  };

  const handleDelete = (paperId: string) => {
    setPaperToDelete(paperId);
  };

  const confirmDelete = () => {
    if (paperToDelete) {
      deleteMutation.mutate(paperToDelete);
    }
  };

  // For now, show all papers - in production, filter by contributors
  // TODO: Implement /api/users/:userId/papers endpoint
  const myPapers = allPapers || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-light mb-2">My Research Papers</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Manage your consciousness research papers and collaborations
          </p>
        </div>
        <Link href="/papers/new">
          <Button size="lg" className="w-full sm:w-auto" data-testid="button-new-paper">
            <Plus className="mr-2 h-5 w-5" />
            New Paper
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading papers...</p>
        </div>
      ) : myPapers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No papers yet</h3>
            <p className="text-muted-foreground mb-6">
              Start your research journey by creating your first paper
            </p>
            <Link href="/papers/new">
              <Button data-testid="button-create-first-paper">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Paper
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {myPapers.map((paper) => (
            <Card 
              key={paper.id} 
              className="hover-elevate transition-all"
              data-testid={`card-paper-${paper.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-2xl">{paper.title}</CardTitle>
                      <Badge 
                        variant={
                          paper.status === "draft" ? "secondary" : 
                          paper.status === "in_review" ? "default" : 
                          "default"
                        }
                        data-testid={`badge-status-${paper.id}`}
                      >
                        {paper.status === "draft" ? "Draft" : 
                         paper.status === "in_review" ? "In Review" : 
                         "Published"}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {paper.abstract}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Category: {paper.category}</span>
                    <span>•</span>
                    <span>Updated {new Date(paper.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/papers/${paper.id}/edit`}>
                      <Button 
                        variant="outline" 
                        size="sm"
                        data-testid={`button-edit-${paper.id}`}
                      >
                        Edit
                      </Button>
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleView(paper.id)}
                      data-testid={`button-view-${paper.id}`}
                    >
                      View
                    </Button>
                    {paper.status === "draft" && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDelete(paper.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${paper.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!paperToDelete} onOpenChange={(open) => !open && setPaperToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-paper">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Paper</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this paper? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              data-testid="button-confirm-delete"
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
