import { z } from "zod";
import { DomainError } from "../domain/errors";
import { idSchema } from "../domain/state";
import { ExtractionService, type ExtractionRunResult } from "../extraction/service";
import { productionExtractor } from "../extraction/production";
import { productionRepository } from "./api";

const extractionRequestSchema = z.strictObject({ sourceRevisionId: idSchema });

export type ExtractionRunDto = {
  status: ExtractionRunResult["status"];
  sourceRevisionId: string;
  baseStateVersion: number;
  candidateDeltas: ExtractionRunResult["deltas"];
  validatorResults: ExtractionRunResult["validatorResults"];
  compilerIssues: ExtractionRunResult["compilerIssues"];
  warnings: ExtractionRunResult["warnings"];
  evidence: ExtractionRunResult["evidence"];
  events: ExtractionRunResult["events"];
  provider: ExtractionRunResult["provider"];
  timing: ExtractionRunResult["timing"];
};

export function toExtractionRunDto(result: ExtractionRunResult): ExtractionRunDto {
  return {
    status: result.status,
    sourceRevisionId: result.sourceRevisionId,
    baseStateVersion: result.baseStateVersion,
    candidateDeltas: result.deltas.map((delta, index) => ({
      ...delta,
      validatorResult: result.validatorResults[index] ?? delta.validatorResult,
    })),
    validatorResults: result.validatorResults,
    compilerIssues: result.compilerIssues,
    warnings: result.warnings,
    evidence: result.evidence,
    events: result.events,
    provider: result.provider,
    timing: result.timing,
  };
}

export function productionExtractionService(repository = productionRepository()): ExtractionService {
  return new ExtractionService(repository, productionExtractor());
}

export async function extractionRequest(request: Request, storyId: string, service?: ExtractionService): Promise<ExtractionRunDto> {
  const { sourceRevisionId } = extractionRequestSchema.parse(await request.json());
  idSchema.parse(storyId);
  const result = await (service ?? productionExtractionService()).extractRevision(storyId, sourceRevisionId);
  if (result.status === "failed") {
    if (result.error === "EXTRACTION_OUTPUT_INVALID")
      throw new DomainError("EXTRACTION_OUTPUT_INVALID", "Extractor returned an invalid structured proposal", 422);
    throw new DomainError("EXTRACTOR_UNAVAILABLE", "Extraction service is unavailable", 502);
  }
  return toExtractionRunDto(result);
}
