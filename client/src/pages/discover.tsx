import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { UserTypeBadge } from "@/components/user-type-badge";
import { BlockchainBadge } from "@/components/blockchain-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import type { Paper, PaperContributor, User, BlockchainRecord } from "@shared/schema";
import { useState } from "react";

type PaperWithDetails = Paper & {
  contributors: (PaperContributor & { user: User })[];
  blockchainRecords: BlockchainRecord[];
};

export default function Discover() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  const { data: papers, isLoading } = useQuery<Paper[]>({
    queryKey: ['/api/papers'],
  });
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-light mb-2">Discover Research</h1>
        <p className="text-muted-foreground">
          Explore consciousness research created through human-AI collaboration
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search papers by title, author, or topic..." 
            className="pl-10"
            data-testid="input-search-papers"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-full sm:w-48" data-testid="select-filter-category">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="consciousness">Consciousness Studies</SelectItem>
            <SelectItem value="ai">AI Research</SelectItem>
            <SelectItem value="neuroscience">Neuroscience</SelectItem>
            <SelectItem value="philosophy">Philosophy</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-full sm:w-48" data-testid="select-filter-verification">
            <SelectValue placeholder="Verification Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Papers</SelectItem>
            <SelectItem value="verified">Blockchain Verified</SelectItem>
            <SelectItem value="pending">Pending Verification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Papers Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">Loading research papers...</p>
          </div>
        ) : !papers || papers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">No papers published yet</p>
          </div>
        ) : (
          papers.filter(paper => paper.status === "published").map((paper) => (
          <Card 
            key={paper.id} 
            className="hover-elevate transition-all duration-300 flex flex-col"
            data-testid={`card-paper-${paper.id}`}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge variant="secondary">{paper.category}</Badge>
              </div>
              <CardTitle className="text-xl leading-tight">
                {paper.title}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1">
              <CardDescription className="line-clamp-3 mb-4">
                {paper.abstract}
              </CardDescription>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Category: {paper.category}</p>
                  <p className="text-xs text-muted-foreground">
                    Published {new Date(paper.publishedAt || paper.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <button className="text-sm text-primary hover:underline" data-testid={`button-view-paper-${paper.id}`}>
                View Full Paper →
              </button>
            </CardFooter>
          </Card>
        ))
        )}
      </div>
    </div>
  );
}
