import { z } from "zod";

export const specialistSchema = z.enum(["evidence", "knowledge_boundary", "temporal_state"]);
export const verdictSchema = z.enum(["SUPPORTED", "UNCERTAIN", "UNSUPPORTED"]);
export const shortReasonSchema = z.string().trim().min(1).max(600).refine(
  value => value.split(/[。！？]+|[.!?]+(?:\s+|$)/u).filter(part => part.trim()).length <= 3,
  "Use at most three short sentences",
);
export const semanticCheckSchema = z.strictObject({
  agent: specialistSchema,
  verdict: verdictSchema,
  reason: shortReasonSchema,
  evidenceIds: z.array(z.uuid()).max(24),
});
export const genericSemanticCheckSchema = z.strictObject({
  agent: z.literal("generic"),
  verdict: verdictSchema,
  reason: shortReasonSchema,
  evidenceIds: z.array(z.uuid()).max(24),
});
export const validationCheckSchema = z.strictObject({
  agent: z.enum(["deterministic", "context", "generic", ...specialistSchema.options]),
  verdict: verdictSchema,
  reason: shortReasonSchema,
  evidenceIds: z.array(z.uuid()).max(24),
  code: z.string().max(80).optional(),
});
export type Specialist = z.infer<typeof specialistSchema>;
export type SemanticAgent = Specialist | "generic";
export type SemanticCheckResult = z.infer<typeof semanticCheckSchema>;
export type GenericSemanticCheckResult = z.infer<typeof genericSemanticCheckSchema>;
export type ValidationCheck = z.infer<typeof validationCheckSchema>;
