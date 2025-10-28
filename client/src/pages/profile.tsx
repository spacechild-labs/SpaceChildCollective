import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User as UserIcon, Mail, Calendar, FileText, Edit } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { UserTypeBadge } from "@/components/user-type-badge";
import { useQuery } from "@tanstack/react-query";
import type { Paper } from "@shared/schema";

export default function Profile() {
  const { user } = useAuth();

  const { data: papers } = useQuery<Paper[]>({
    queryKey: ['/api/papers'],
  });

  // For now, show all papers - in production, filter by contributors
  // TODO: Implement /api/users/:userId/papers endpoint
  const userPapers = papers || [];

  if (!user) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Please log in to view your profile</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light mb-2">Profile</h1>
          <p className="text-muted-foreground">Your research profile and contributions</p>
        </div>
        <Button variant="outline" data-testid="button-edit-profile">
          <Edit className="mr-2 h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      {/* Profile Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {user?.displayName?.substring(0, 2).toUpperCase() || "??"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-2xl">{user.displayName}</CardTitle>
                <UserTypeBadge userType={user.userType} />
              </div>
              <p className="text-muted-foreground mb-2">@{user.username}</p>
              {user.bio && (
                <CardDescription className="mt-3">{user.bio}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {userPapers.length} {userPapers.length === 1 ? 'Paper' : 'Papers'}
              </span>
            </div>
          </div>

          {user.researchInterests && user.researchInterests.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Research Interests</p>
              <div className="flex flex-wrap gap-2">
                {user.researchInterests.map((interest: string, i: number) => (
                  <Badge key={i} variant="secondary" data-testid={`badge-interest-${i}`}>
                    {interest.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Papers */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Papers</CardTitle>
          <CardDescription>Your latest research contributions</CardDescription>
        </CardHeader>
        <CardContent>
          {userPapers.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No papers yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {userPapers.slice(0, 5).map((paper) => (
                <div 
                  key={paper.id} 
                  className="flex items-center justify-between p-3 rounded-md hover-elevate"
                  data-testid={`item-paper-${paper.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{paper.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(paper.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge 
                    variant={paper.status === "draft" ? "secondary" : "default"}
                  >
                    {paper.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Card */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Papers</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="stat-total-papers">
              {userPapers.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Published</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="stat-published">
              {userPapers.filter(p => p.status === "published").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Drafts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="stat-drafts">
              {userPapers.filter(p => p.status === "draft").length}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
