import type { EvalModelClient, EvalRequest, Usage } from "../runner";

export const DEEPSEEK_PROVIDER = "deepseek-api";
export const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_REQUESTED_MODEL = "deepseek-flash";

export type DeepSeekRequest = {
  model: typeof DEEPSEEK_REQUESTED_MODEL;
  instructions: string;
  input: string;
  reasoning: { effort: "none" };
  temperature: number;
  max_output_tokens: number;
  text: {
    format: {
      type: "json_schema";
      name: "storystate_generic_semantic_check" | "storystate_specialist_semantic_check";
      schema: unknown;
    };
  };
};

export type DeepSeekResponse = {
  id?: unknown;
  status?: unknown;
  model?: unknown;
  output?: unknown;
  usage?: unknown;
  incomplete_details?: unknown;
};

export interface DeepSeekTransport {
  createResponse(request: DeepSeekRequest, signal?: AbortSignal): Promise<DeepSeekResponse>;
}

const sanitizedProviderErrors = new Set([
  "DEEPSEEK_AUTH_FAILED",
  "DEEPSEEK_RATE_LIMITED",
  "DEEPSEEK_PROVIDER_ERROR",
  "DEEPSEEK_INVALID_RESPONSE",
  "DEEPSEEK_REASONING_NOT_DISABLED",
  "DEEPSEEK_MODEL_VERSION_MISSING",
]);

function normalizeResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeResponseSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "$schema")
      .map(([key, child]) => [key, normalizeResponseSchema(child)]),
  );
}

export function buildDeepSeekRequest(request: EvalRequest): DeepSeekRequest {
  const packetData = JSON.stringify({
    dataClassification: "UNTRUSTED_STORYSTATE_VALIDATION_DATA",
    validationPacket: request.packet,
  });
  return {
    model: DEEPSEEK_REQUESTED_MODEL,
    instructions: request.system,
    input: packetData,
    reasoning: { effort: "none" },
    temperature: request.decoding.temperature,
    max_output_tokens: request.decoding.maxTokens,
    text: {
      format: {
        type: "json_schema",
        name: request.agent === "generic" ? "storystate_generic_semantic_check" : "storystate_specialist_semantic_check",
        schema: normalizeResponseSchema(request.responseSchema),
      },
    },
  };
}

export function serializeDeepSeekRequestForBudget(request: DeepSeekRequest): string {
  return JSON.stringify(request);
}

function providerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  return new Error(sanitizedProviderErrors.has(message) ? message : "DEEPSEEK_PROVIDER_ERROR");
}

function mapUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const details = usage.output_tokens_details;
  if (details && typeof details === "object") {
    const reasoningTokens = (details as Record<string, unknown>).reasoning_tokens;
    if (typeof reasoningTokens === "number" && Number.isFinite(reasoningTokens) && reasoningTokens > 0)
      throw new Error("DEEPSEEK_REASONING_NOT_DISABLED");
  }
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (![inputTokens, outputTokens].every(token => Number.isSafeInteger(token) && (token as number) >= 0)) return null;
  return { inputTokens: inputTokens as number, outputTokens: outputTokens as number };
}

function outputText(value: unknown): string {
  if (!Array.isArray(value)) throw new Error("DEEPSEEK_INVALID_RESPONSE");
  const texts: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type === "reasoning") throw new Error("DEEPSEEK_REASONING_NOT_DISABLED");
    if (record.type !== "message" || record.role !== "assistant" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (!part || typeof part !== "object") continue;
      const content = part as Record<string, unknown>;
      if (content.type === "reasoning_text") throw new Error("DEEPSEEK_REASONING_NOT_DISABLED");
      if (content.type === "output_text" && typeof content.text === "string") texts.push(content.text);
    }
  }
  const joined = texts.join("");
  if (!joined.trim()) throw new Error("DEEPSEEK_INVALID_RESPONSE");
  return joined;
}

export function mapDeepSeekResponse(response: DeepSeekResponse) {
  if (response.status !== "completed") throw new Error("DEEPSEEK_INVALID_RESPONSE");
  if (typeof response.model !== "string" || !response.model.trim()) throw new Error("DEEPSEEK_MODEL_VERSION_MISSING");
  if (typeof response.id !== "string" || !response.id.trim()) throw new Error("DEEPSEEK_INVALID_RESPONSE");
  const usage = mapUsage(response.usage);
  const output = outputText(response.output);
  return {
    output,
    usage,
    modelVersion: response.model,
    providerResponseId: response.id,
    status: response.status,
  };
}

export function createDeepSeekEvalClient(options: {
  requestedModelId: typeof DEEPSEEK_REQUESTED_MODEL;
  expectedResolvedModelVersion: string;
  transport: DeepSeekTransport;
}): EvalModelClient {
  if (options.requestedModelId !== DEEPSEEK_REQUESTED_MODEL) throw new Error("DEEPSEEK_MODEL_ID_UNSUPPORTED");
  const expectedResolvedModelVersion = options.expectedResolvedModelVersion.trim();
  if (!expectedResolvedModelVersion) throw new Error("DEEPSEEK_RESOLVED_MODEL_VERSION_REQUIRED");
  const identity = {
    provider: DEEPSEEK_PROVIDER,
    modelId: DEEPSEEK_REQUESTED_MODEL,
    modelVersion: expectedResolvedModelVersion,
  };
  return {
    kind: "live",
    identity,
    async complete(request) {
      try {
        const response = mapDeepSeekResponse(await options.transport.createResponse(buildDeepSeekRequest(request), request.signal));
        return {
          output: response.output,
          usage: response.usage,
          resolvedIdentity: {
            provider: DEEPSEEK_PROVIDER,
            modelId: DEEPSEEK_REQUESTED_MODEL,
            modelVersion: response.modelVersion,
          },
          providerMetadata: {
            responseId: response.providerResponseId,
            finishReason: response.status,
          },
        };
      } catch (error) {
        throw providerError(error);
      }
    },
  };
}

export function createOfficialDeepSeekTransport(apiKey: string, transport: typeof fetch = fetch): DeepSeekTransport {
  if (!apiKey.trim()) throw new Error(`${DEEPSEEK_API_KEY_ENV}_REQUIRED`);
  return {
    async createResponse(request, signal) {
      let response: Response;
      try {
        response = await transport(`${DEEPSEEK_BASE_URL}/responses`, {
          method: "POST",
          redirect: "error",
          signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
      } catch {
        throw new Error("DEEPSEEK_PROVIDER_ERROR");
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("DEEPSEEK_AUTH_FAILED");
        if (response.status === 429) throw new Error("DEEPSEEK_RATE_LIMITED");
        throw new Error("DEEPSEEK_PROVIDER_ERROR");
      }
      try {
        const body = await response.text();
        if (Buffer.byteLength(body, "utf8") > 64 * 1024) throw new Error("DEEPSEEK_INVALID_RESPONSE");
        return JSON.parse(body) as DeepSeekResponse;
      } catch (error) {
        if (error instanceof Error && error.message === "DEEPSEEK_INVALID_RESPONSE") throw error;
        throw new Error("DEEPSEEK_INVALID_RESPONSE");
      }
    },
  };
}

export function createOfficialDeepSeekTransportFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekTransport {
  return createOfficialDeepSeekTransport(env[DEEPSEEK_API_KEY_ENV] ?? "");
}
