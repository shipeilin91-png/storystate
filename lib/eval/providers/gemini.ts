import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import type { EvalModelClient, EvalRequest, Usage } from "../runner";

export const GEMINI_PROVIDER = "google-gemini-developer-api";
export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";
export const GEMINI_CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export type GeminiCandidateModel = (typeof GEMINI_CANDIDATE_MODELS)[number];

export type GeminiResponse = Pick<GenerateContentResponse, "text" | "modelVersion" | "responseId" | "usageMetadata" | "candidates">;

export interface GeminiTransport {
  generateContent(parameters: GenerateContentParameters): Promise<GeminiResponse>;
}

function withoutSchemaDialect(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSchemaDialect);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").map(([key, child]) => [key, withoutSchemaDialect(child)]));
}

export function buildGeminiRequest(request: EvalRequest, requestedModelId: string): GenerateContentParameters {
  if (!requestedModelId.trim()) throw new Error("GEMINI_MODEL_ID_REQUIRED");
  const packetData = JSON.stringify({
    dataClassification: "UNTRUSTED_STORYSTATE_VALIDATION_DATA",
    validationPacket: request.packet,
  });
  return {
    model: requestedModelId,
    contents: [{ role: "user", parts: [{ text: packetData }] }],
    config: {
      abortSignal: request.signal,
      systemInstruction: request.system,
      temperature: request.decoding.temperature,
      maxOutputTokens: request.decoding.maxTokens,
      candidateCount: request.decoding.responses,
      responseMimeType: "application/json",
      responseJsonSchema: withoutSchemaDialect(request.responseSchema),
    },
  };
}

export function serializeGeminiRequestForBudget(parameters: GenerateContentParameters): string {
  const copy = structuredClone(parameters);
  if (copy.config) delete copy.config.abortSignal;
  return JSON.stringify(copy);
}

function mapUsage(response: GeminiResponse): Usage | null {
  const inputTokens = response.usageMetadata?.promptTokenCount;
  const outputTokens = response.usageMetadata?.candidatesTokenCount;
  if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value! >= 0)) return null;
  return { inputTokens: inputTokens!, outputTokens: outputTokens! };
}

export function createGeminiEvalClient(options: {
  requestedModelId: string;
  expectedResolvedModelVersion: string;
  transport: GeminiTransport;
}): EvalModelClient {
  const requestedModelId = options.requestedModelId.trim();
  const expectedResolvedModelVersion = options.expectedResolvedModelVersion.trim();
  if (!requestedModelId) throw new Error("GEMINI_MODEL_ID_REQUIRED");
  if (!expectedResolvedModelVersion) throw new Error("GEMINI_RESOLVED_MODEL_VERSION_REQUIRED");
  const identity = { provider: GEMINI_PROVIDER, modelId: requestedModelId, modelVersion: expectedResolvedModelVersion };
  return {
    kind: "live",
    identity,
    async complete(request) {
      let response: GeminiResponse;
      try {
        response = await options.transport.generateContent(buildGeminiRequest(request, requestedModelId));
      } catch {
        throw new Error("GEMINI_PROVIDER_ERROR");
      }
      if (!response.modelVersion) throw new Error("GEMINI_RESPONSE_MODEL_VERSION_MISSING");
      if (typeof response.text !== "string" || !response.text.trim()) throw new Error("GEMINI_RESPONSE_TEXT_MISSING");
      return {
        output: response.text,
        usage: mapUsage(response),
        resolvedIdentity: { provider: GEMINI_PROVIDER, modelId: requestedModelId, modelVersion: response.modelVersion },
        providerMetadata: {
          responseId: response.responseId,
          finishReason: response.candidates?.[0]?.finishReason,
        },
      };
    },
  };
}

export function createOfficialGeminiTransport(apiKey: string): GeminiTransport {
  if (!apiKey.trim()) throw new Error(`${GEMINI_API_KEY_ENV}_REQUIRED`);
  const client = new GoogleGenAI({ apiKey });
  return { generateContent: parameters => client.models.generateContent(parameters) };
}

export function createOfficialGeminiTransportFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiTransport {
  return createOfficialGeminiTransport(env[GEMINI_API_KEY_ENV] ?? "");
}
