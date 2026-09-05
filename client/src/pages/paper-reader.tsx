import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Tag, Users } from "lucide-react";
import { Link, useRoute } from "wouter";
import type { Paper, PaperContributor, User } from "@shared/schema";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type PublishedPaper = Paper & {
  contributors: (PaperContributor & { user: User })[];
};

export default function PaperReader() {
  const [, params] = useRoute("/papers/:id");
  const paperId = params?.id;
  const { data: paper, isLoading, isError } = useQuery<PublishedPaper>({
    queryKey: [`/api/papers/${paperId}`],
    enabled: Boolean(paperId),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-4xl p-8">Loading published paper…</main>;
  }

  if (isError || !paper || paper.status !== "published") {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="mb-3 text-3xl font-light">Published paper not found</h1>
        <p className="mb-6 text-muted-foreground">This URL does not identify a public research paper.</p>
        <Link href="/discover"><Button variant="outline">Browse published research</Button></Link>
      </main>
    );
  }

  const authors = paper.contributors
    .filter(({ role }) => role === "author")
    .map(({ user }) => user.displayName || user.username)
    .filter(Boolean);
  const publishedDate = new Date(paper.publishedAt || paper.createdAt).toLocaleDateString();

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Link href="/discover">
        <Button variant="ghost" className="mb-6 pl-0">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Published research
        </Button>
      </Link>
      <article>
        <Card>
          <CardHeader className="space-y-5">
            <Badge className="w-fit" variant="secondary">{paper.category}</Badge>
            <h1 className="font-display text-3xl font-light leading-tight sm:text-5xl">{paper.title}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {authors.length > 0 && (
                <span className="flex items-center gap-2"><Users className="h-4 w-4" />{authors.join(", ")}</span>
              )}
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Published {publishedDate}</span>
              <span className="flex items-center gap-2"><Tag className="h-4 w-4" />{paper.category}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <section aria-labelledby="abstract-heading">
              <h2 id="abstract-heading" className="mb-3 text-2xl font-medium">Abstract</h2>
              <p className="leading-7 text-muted-foreground">{paper.abstract}</p>
            </section>
            <section aria-labelledby="paper-heading">
              <h2 id="paper-heading" className="sr-only">Paper</h2>
              <Markdown>{paper.content}</Markdown>
            </section>
          </CardContent>
        </Card>
      </article>
    </main>
  );
}