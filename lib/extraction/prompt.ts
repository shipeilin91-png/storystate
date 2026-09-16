import { invariant } from "../domain/errors";
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

function entityAlias(packet: ExtractionPacket, id: string, kind: ExtractionPacket["entities"][number]["kind"]): string {
  const entity = packet.entities.find(value => value.id === id && value.kind === kind);
  invariant(entity, "MODEL_SAFE_REFERENCE", "Canonical reference is unavailable to the extraction model");
  return entity.alias;
}

function nullableEntityAlias(
  packet: ExtractionPacket,
  id: string | null,
  kind: ExtractionPacket["entities"][number]["kind"],
): string | null {
  return id === null ? null : entityAlias(packet, id, kind);
}

function epistemicCharacterRefs(
  packet: ExtractionPacket,
  value: { value: string | null; status: "resolved" | "unresolved"; lastConfirmedValue: string | null },
) {
  return {
    valueRef: nullableEntityAlias(packet, value.value, "character"),
    status: value.status,
    lastConfirmedValueRef: nullableEntityAlias(packet, value.lastConfirmedValue, "character"),
  };
}

export function modelSafeExtractionPacket(packet: ExtractionPacket) {
  return {
    contractVersion: packet.contractVersion,
    contractHash: packet.contractHash,
    source: { sourceOrder: packet.sourceOrder, chapter: packet.chapter, content: packet.content },
    entities: packet.entities.map(({ alias, kind, labels }) => ({ alias, kind, labels })),
    currentState: {
      characters: packet.currentState.characters.filter(row => row.active).map(row => ({
        ref: entityAlias(packet, row.id, "character"),
        name: row.name,
        role: row.role,
        location: row.location,
      })),
      items: packet.currentState.items.filter(row => row.active).map(row => ({
        ref: entityAlias(packet, row.id, "item"),
        name: row.name,
        owner: epistemicCharacterRefs(packet, row.owner),
        holder: epistemicCharacterRefs(packet, row.holder),
        custodian: row.custodian === null ? null : epistemicCharacterRefs(packet, row.custodian),
        condition: row.condition,
      })),
      plotThreads: packet.currentState.plotThreads.filter(row => row.active).map(row => ({
        ref: entityAlias(packet, row.id, "thread"),
        title: row.title,
        coreQuestion: row.coreQuestion,
        status: row.status,
        resolution: row.resolution,
      })),
      propositions: packet.currentState.propositions.filter(row => row.active).map(row => ({
        ref: entityAlias(packet, row.id, "proposition"),
        statement: row.statement,
        kind: row.kind,
        reportedPropositionRef: nullableEntityAlias(packet, row.reportedPropositionId, "proposition"),
        reporterRef: nullableEntityAlias(packet, row.reporterId, "character"),
      })),
      worldTruth: packet.currentState.worldTruth.filter(row => row.active).map(row => ({
        propositionRef: entityAlias(packet, row.propositionId, "proposition"),
        status: row.status,
      })),
      knowledge: packet.currentState.knowledge.filter(row => row.active).map(row => ({
        characterRef: entityAlias(packet, row.characterId, "character"),
        propositionRef: entityAlias(packet, row.propositionId, "proposition"),
        stance: row.stance,
        believedValue: row.believedValue,
      })),
      relationships: packet.currentState.relationships.filter(row => row.active).map(row => ({
        ref: entityAlias(packet, row.id, "relationship"),
        fromCharacterRef: entityAlias(packet, row.fromCharacterId, "character"),
        toCharacterRef: entityAlias(packet, row.toCharacterId, "character"),
        category: row.category,
        predicate: row.predicate,
        value: row.value,
        scope: row.scope,
      })),
    },
  };
}

export function buildExtractionRequest(packet: ExtractionPacket): { system: string; input: string } {
  const input = JSON.stringify(modelSafeExtractionPacket(packet));
  const internalIds = [
    packet.storyId,
    packet.sourceRevisionId,
    ...Object.values(packet.currentState).flatMap(rows => rows.map(row => row.id)),
  ];
  invariant(internalIds.every(id => !input.includes(id)), "MODEL_INPUT_ID_LEAK", "Model-safe extraction input contains an internal identifier");
  return { system: extractionPrompt, input };
}
