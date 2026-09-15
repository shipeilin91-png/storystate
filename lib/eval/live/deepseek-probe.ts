import { emptyState } from "../../domain/state";
import type { ValidationPacket } from "../../server/validator/context";
import { deepFreeze } from "../contract";
import {
  buildDeepSeekRequest,
  mapDeepSeekResponse,
  DEEPSEEK_PROVIDER,
  DEEPSEEK_REQUESTED_MODEL,
  type DeepSeekResponse,
} from "../providers/deepseek";
import { decoding, genericPrompt, parseGeneric, responseSchemaFor, type EvalRequest } from "../runner";

export const SYNTHETIC_PROBE_QUOTE = "A red key is lying on the desk.";
const SYNTHETIC_PROBE_QUOTE_START = 0;

export const SYNTHETIC_PROBE_PACKET = deepFreeze<ValidationPacket>({
  candidateDelta: {
    id: "00000000-0000-4000-8000-0000000000d1",
    operation: "UPDATE",
    targetType: "items",
    targetId: "00000000-0000-4000-8000-0000000000a1",
    fieldPath: "condition",
    before: "unrecorded",
    after: "red",
    sourceKind: "story_event",
    sourceEventId: "00000000-0000-4000-8000-0000000000b1",
    effect: null,
    evidenceIds: ["00000000-0000-4000-8000-0000000000e1"],
    reason: "The synthetic evidence directly describes the key as red.",
    basis: { kinds: ["direct_observation"], note: "Synthetic probe evidence only." },
    resolutionSupport: null,
  },
  currentStateSlice: {
    ...emptyState(),
    items: [{
      id: "00000000-0000-4000-8000-0000000000a1",
      active: true,
      name: "key",
      owner: { value: null, status: "unresolved", lastConfirmedValue: null },
      holder: { value: null, status: "unresolved", lastConfirmedValue: null },
      custodian: null,
      condition: "unrecorded",
    }],
  },
  primaryEvidence: [{
    id: "00000000-0000-4000-8000-0000000000e1",
    sourceRevisionId: "00000000-0000-4000-8000-0000000000c1",
    quote: SYNTHETIC_PROBE_QUOTE,
    start: SYNTHETIC_PROBE_QUOTE_START,
    end: SYNTHETIC_PROBE_QUOTE_START + SYNTHETIC_PROBE_QUOTE.length,
    speakerId: null,
    sourceOrder: 1,
    chapter: null,
    eventIds: ["00000000-0000-4000-8000-0000000000b1"],
  }],
  retrievedEvidence: [],
  provenance: {
    storyId: "00000000-0000-4000-8000-0000000000f1",
    stateVersion: 0,
    storyRevision: 1,
    currentChapter: null,
    sourceEvent: {
      id: "00000000-0000-4000-8000-0000000000b1",
      sourceOrder: 1,
      storyTime: null,
      participantIds: [],
    },
    retrievalTruncated: false,
  },
});

export function buildDeepSeekProbeRequest() {
  const request: EvalRequest = {
    agent: "generic",
    system: genericPrompt,
    packet: SYNTHETIC_PROBE_PACKET,
    identity: {
      provider: DEEPSEEK_PROVIDER,
      modelId: DEEPSEEK_REQUESTED_MODEL,
      modelVersion: "UNKNOWN_UNTIL_PROBE",
    },
    decoding,
    responseSchema: responseSchemaFor("generic"),
    signal: new AbortController().signal,
  };
  return buildDeepSeekRequest(request);
}

export function parseDeepSeekProbeResponse(response: DeepSeekResponse) {
  const mapped = mapDeepSeekResponse(response);
  return {
    requestedModelId: DEEPSEEK_REQUESTED_MODEL,
    resolvedModelVersion: mapped.modelVersion,
    providerResponseId: mapped.providerResponseId,
    status: mapped.status,
    usage: mapped.usage,
    semantic: parseGeneric(mapped.output, SYNTHETIC_PROBE_PACKET),
  };
}

export function assertDeepSeekProbeDisabled(): never {
  throw new Error("DEEPSEEK_PROBE_NOT_AUTHORIZED: Product Owner approval is required before reading a key or making one synthetic call");
}
