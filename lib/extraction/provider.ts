import { z } from "zod";
import { extractionProposalSchema, type ExtractionProposal } from "./contract";
import { buildExtractionRequest, type ExtractionPacket } from "./prompt";

export type ExtractorRequest = {
  packet: ExtractionPacket;
  system: string;
  input: string;
  signal: AbortSignal;
};

export type ExtractorProvider = {
  modelId: string;
  complete(request: ExtractorRequest): Promise<unknown>;
};

export class FakeExtractorProvider implements ExtractorProvider {
  calls = 0;
  constructor(private readonly output: unknown, readonly modelId = "fake-extractor") {}
  async complete(_request: ExtractorRequest): Promise<unknown> {
    void _request;
    this.calls += 1;
    return structuredClone(this.output);
  }
}

export class ChatCompletionsExtractorProvider implements ExtractorProvider {
  constructor(
    readonly modelId: string,
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly transport: typeof fetch = fetch,
    private readonly maxBytes = 48000,
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS extractor endpoint required");
  }
  async complete(request: ExtractorRequest): Promise<unknown> {
    const response = await this.transport(this.endpoint, {
      method: "POST",
      redirect: "error",
      signal: request.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.modelId,
        temperature: 0,
        n: 1,
        max_tokens: 2000,
        messages: [{ role: "system", content: request.system }, { role: "user", content: request.input }],
        response_format: { type: "json_schema", json_schema: { name: "storystate_extraction_proposal", strict: true, schema: z.toJSONSchema(extractionProposalSchema) } },
      }),
    });
    if (!response.ok) throw new Error("EXTRACTOR_PROVIDER_UNAVAILABLE");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("EXTRACTOR_EMPTY_RESPONSE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.maxBytes) {
          await reader.cancel();
          throw new Error("EXTRACTOR_RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const envelope = z.object({
      choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string() }) })).length(1),
    }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return envelope.choices[0].message.content;
  }
}

export function parseExtractionProposal(output: unknown): ExtractionProposal {
  try {
    const parsed = typeof output === "string" ? JSON.parse(output) : output;
    return extractionProposalSchema.parse(parsed);
  } catch {
    throw new Error("EXTRACTION_OUTPUT_INVALID");
  }
}

export function requestFor(packet: ExtractionPacket, signal: AbortSignal): ExtractorRequest {
  const request = buildExtractionRequest(packet);
  return { packet, ...request, signal };
}
