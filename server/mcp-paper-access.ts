/** Papers an MCP caller may see without being a contributor: published ones only. */
export function publishedOnly<T extends { status: string }>(papers: T[]): T[] {
  return papers.filter((p) => p.status === "published");
}

/** An agent may read a paper if it is published or the agent is one of its contributors. */
export function agentCanReadPaper(
  paper: { status: string; contributors?: { userId: string }[] },
  agentId: string,
): boolean {
  return paper.status === "published" || Boolean(paper.contributors?.some((c) => c.userId === agentId));
}
