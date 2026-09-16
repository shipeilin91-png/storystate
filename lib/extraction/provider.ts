import { z } from "zod";
import { extractionProposalSchema, type ExtractionProposal } from "./contract";
import { buildExtractionRequest, type ExtractionPacket } from "./prompt";

const DEEPSEEK_JSON_INSTRUCTION = `Return ONLY valid JSON.
No markdown.
No explanation.
No chain-of-thought.
Example structure: {"evidence":[],"events":[],"effects":[],"unresolvedMentions":[]}
Use this exact compact contract; every listed field is required and no other fields are allowed:
evidence[] = {"key":string,"quote":string,"occurrence":nonnegative integer,"speakerRef":entity alias or null}.
events[] = {"key":string,"kind":"movement"|"transfer"|"disclosure"|"observation"|"document_discovery"|"state_revelation"|"plot_revelation"|"relationship_action","participantRefs":entity alias[],"evidenceKeys":string[]}.
Every effect requires {"eventKey":string,"evidenceKeys":string[],"supportKinds":support kind[],"supportSummary":string,"confidence":number 0..1}.
support kind = "direct_observation"|"direct_disclosure"|"credential_inspection"|"reported_claim"|"documentary_evidence"|"inference".
For effects[].kind use EXACTLY one of: "character_location", "item_holder", "item_owner", "item_custodian", "item_condition", "knowledge_state", "world_truth_status", "plot_thread_status", "relationship_value". Never invent an effect kind and never use an event kind such as "movement" or "transfer" as an effect kind.
Effect shapes:
{"kind":"character_location","characterRef":alias,"after":{"value":string|null,"status":"resolved"|"unresolved","lastConfirmedValue":string|null}}
{"kind":"item_holder"|"item_owner","itemRef":alias,"after":{"valueRef":alias|null,"status":"resolved"|"unresolved","lastConfirmedValueRef":alias|null}}
{"kind":"item_custodian","itemRef":alias,"after":null|{"valueRef":alias|null,"status":"resolved"|"unresolved","lastConfirmedValueRef":alias|null}}
{"kind":"item_condition","itemRef":alias,"condition":string}
{"kind":"knowledge_state","characterRef":alias,"propositionRef":alias,"stance":"unaware"|"suspects"|"believes"|"knows","believedValue":boolean|null}
{"kind":"world_truth_status","propositionRef":alias,"status":"unresolved"|"confirmed_true"|"confirmed_false"}
{"kind":"plot_thread_status","threadRef":alias,"status":"open"|"progressing"|"resolved","resolution":string|null,"resolutionAssessment":"direct_answer"|"strong_inference"|null}
{"kind":"relationship_value","relationshipRef":alias,"value":string,"scope":string}.
Valid effect example: {"eventKey":"EV1","evidenceKeys":["E1"],"supportKinds":["direct_observation"],"supportSummary":"The quoted handoff changes the holder.","confidence":1,"kind":"item_holder","itemRef":"ITEM_001","after":{"valueRef":"CHAR_002","status":"resolved","lastConfirmedValueRef":"CHAR_002"}}.
unresolvedMentions[] = {"mention":string,"quote":string,"occurrence":nonnegative integer,"reason":string}.`;

export function isDeepSeekEndpoint(endpoint: string): boolean {
  return new URL(endpoint).hostname === "api.deepseek.com";
}

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
  private readonly deepSeekJsonMode: boolean;

  constructor(
    readonly modelId: string,
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly transport: typeof fetch = fetch,
    private readonly maxBytes = 48000,
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS extractor endpoint required");
    this.deepSeekJsonMode = isDeepSeekEndpoint(endpoint);
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
        max_tokens: this.deepSeekJsonMode ? 8000 : 2000,
        ...(this.deepSeekJsonMode ? { stream: false, thinking: { type: "disabled" } } : {}),
        messages: [
          { role: "system", content: this.deepSeekJsonMode ? `${request.system}\n\n${DEEPSEEK_JSON_INSTRUCTION}` : request.system },
          { role: "user", content: request.input },
        ],
        response_format: this.deepSeekJsonMode
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: "storystate_extraction_proposal", strict: true, schema: z.toJSONSchema(extractionProposalSchema) } },
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
    let envelope: { choices: Array<{ finish_reason: string | null; message: { content: string } }> };
    try {
      envelope = z.object({
        choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string() }) })).length(1),
      }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new Error("EXTRACTOR_PROVIDER_RESPONSE_INVALID");
    }
    const choice = envelope.choices[0]!;
    if (choice.finish_reason !== "stop") throw new Error("EXTRACTOR_PROVIDER_RESPONSE_INCOMPLETE");
    if (choice.message.content.trim().length === 0) throw new Error("EXTRACTOR_EMPTY_CONTENT");
    return choice.message.content;
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
