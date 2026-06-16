import { Worker } from "bullmq";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { QUEUE_NAMES } from "@aula-agente/shared";
import type { DocumentFileType } from "@aula-agente/shared";
import { getRedisConnection, type ProcessDocumentJobData } from "@aula-agente/queue";
import {
  getAdminClient,
  getDocumentById,
  updateDocument,
  insertChunks,
} from "@aula-agente/database";
import { resolveApiKey } from "../lib/vault";
import { chunkText } from "../embeddings/chunker";
import { generateEmbeddings } from "../embeddings/embedder";

async function extractText(url: string, fileType: DocumentFileType): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }

  switch (fileType) {
    case "pdf": {
      const buffer = Buffer.from(await response.arrayBuffer());
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    case "docx": {
      const buffer = Buffer.from(await response.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt":
    case "md":
    case "csv":
      return response.text();
    default: {
      const exhaustive: never = fileType;
      throw new Error(`Unsupported file type: ${exhaustive}`);
    }
  }
}

export function startProcessDocumentWorker() {
  const worker = new Worker<ProcessDocumentJobData>(
    QUEUE_NAMES.PROCESS_DOCUMENT,
    async (job) => {
      const { documentId, organizationId } = job.data;
      const db = getAdminClient();

      try {
        const document = await getDocumentById(db, documentId);

        const text = await extractText(document.file_url, document.file_type);

        if (!text.trim()) {
          await updateDocument(db, documentId, {
            status: "error",
            error_message: "No text content extracted from document",
          });
          return;
        }

        const chunks = chunkText(text);

        const apiKey = await resolveApiKey(organizationId, "openai");

        const embeddings = await generateEmbeddings(
          chunks.map((c) => c.content),
          apiKey
        );

        await insertChunks(
          db,
          chunks.map((chunk, i) => ({
            document_id: documentId,
            organization_id: organizationId,
            content: chunk.content,
            metadata: chunk.metadata,
            embedding: embeddings[i],
            chunk_index: chunk.metadata.chunk_index,
          }))
        );

        await updateDocument(db, documentId, {
          status: "ready",
          chunk_count: chunks.length,
        });

        console.log(`Processed document ${documentId}: ${chunks.length} chunks`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        await updateDocument(db, documentId, {
          status: "error",
          error_message: message,
        });
        throw error;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Document job ${job?.id} failed:`, err.message);
  });

  console.log("Process-document worker started");
  return worker;
}
