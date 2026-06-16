import { tool } from "ai";
import { z } from "zod";
import { getAdminClient, searchKnowledgeChunks } from "@aula-agente/database";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

export function createSearchKnowledgeTool(organizationId: string, agentId: string, apiKey: string) {
  return tool({
    description: "Search the knowledge base for relevant information about a topic. Use this to find answers from uploaded documents.",
    inputSchema: z.object({
      query: z.string().describe("The search query to find relevant information"),
    }),
    execute: async ({ query }: { query: string }) => {
      const openai = createOpenAI({ apiKey });

      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: query,
      });

      const db = getAdminClient();
      const results = await searchKnowledgeChunks(db, organizationId, agentId, embedding, 5);

      if (results.length === 0) {
        return "No relevant information found in the knowledge base.";
      }

      return results
        .map((r, i) => `[${i + 1}] (relevance: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`)
        .join("\n\n---\n\n");
    },
  });
}
