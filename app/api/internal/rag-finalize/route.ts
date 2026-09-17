import { timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import {
  RAG_FINALIZATION_CASE_IDS,
  backfillEvidenceRag,
  finalizationStatus,
  migrateEvidenceRag,
  retrievalSmoke,
  runRagBenchmarkCase,
} from "../../../../lib/rag/finalization";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status") }),
  z.strictObject({ action: z.literal("migrate") }),
  z.strictObject({ action: z.literal("backfill") }),
  z.strictObject({ action: z.literal("retrieval-smoke") }),
  z.strictObject({
    action: z.literal("benchmark-case"),
    caseId: z.enum(RAG_FINALIZATION_CASE_IDS),
    arm: z.enum(["baseline", "rag"]),
  }),
]);

function authorized(request: Request): boolean {
  const expected = process.env.STORYSTATE_RAG_FINALIZE_TOKEN;
  const match = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!expected || expected === "[SENSITIVE]" || !match) return false;
  const suppliedBuffer = Buffer.from(match[1]);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "UNAUTHORIZED" }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2048) return json({ error: "INVALID_INPUT" }, 400);

  let action = "unknown";
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 2048) return json({ error: "INVALID_INPUT" }, 400);
    const input = requestSchema.parse(JSON.parse(text));
    action = input.action;
    switch (input.action) {
      case "status":
        return json(finalizationStatus());
      case "migrate":
        return json(await migrateEvidenceRag());
      case "backfill":
        return json(await backfillEvidenceRag());
      case "retrieval-smoke":
        return json(await retrievalSmoke());
      case "benchmark-case":
        return json(await runRagBenchmarkCase(input.caseId, input.arm));
    }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return json({ error: "INVALID_INPUT" }, 400);
    }
    return json({ error: "FINALIZATION_FAILED", action }, 500);
  }
}
