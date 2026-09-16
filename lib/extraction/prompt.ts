import type { ExtractionPacket } from "./packet";
export type { ExtractionPacket } from "./packet";

export const extractionPrompt = `You are the StoryState semantic extractor.
Return ONLY one JSON object matching the frozen ExtractionProposal contract.
Do not include Markdown, explanations, chain-of-thought, or fields outside the contract.

Use exact quotes from the supplied source content and occurrence numbers. Every effect must cite evidence owned by its EventGroup.
Use only entity aliases from the supplied catalog. If an entity is not known, use unresolvedMentions instead of inventing it.
Direction is not arrival. Historical presence is not current location. Holder is not owner.
Reported propositions are not the underlying proposition. Suspects, believes, and knows are distinct.
Bounded cooperation is not long-term psychological trust. Plot progress is not resolution.
Never output StateDelta/database controls, before/target IDs/field paths/operations, risk, recommendation, decision, validator, version, or commit fields.
Confidence is telemetry only. Do not mutate Canonical State.`;

export function buildExtractionRequest(packet: ExtractionPacket): { system: string; input: string } {
  return { system: extractionPrompt, input: JSON.stringify(packet) };
}
