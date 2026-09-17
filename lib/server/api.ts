import { Pool } from "pg";
import { ZodError } from "zod";
import { DomainError } from "../domain/errors";
import { PostgresStateRepository } from "../repositories/postgres-state-repository";
import { StateService } from "./state-service";

let pool: Pool | undefined;
export function productionPool() {
  const url = process.env.STORYSTATE_DATABASE_URL;
  if (!url) throw new DomainError("DATABASE_UNAVAILABLE", "Backend database not configured", 503);
  if (url === "[SENSITIVE]") throw new DomainError("DATABASE_UNAVAILABLE", "Backend database not configured", 503);
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); }
  catch { throw new DomainError("DATABASE_UNAVAILABLE", "Backend database not configured", 503); }
  if (["localhost", "127.0.0.1", "::1"].includes(host))
    throw new DomainError("DATABASE_LOCAL_REJECTED", "Remote database is required for production operations", 503);
  pool ??= new Pool({ connectionString: url, max: 5 });
  return pool;
}
export function productionRepository() {
  return new PostgresStateRepository(productionPool());
}
export function productionService() {
  return new StateService(productionRepository());
}
export async function respond(work: () => Promise<unknown>) {
  try { return Response.json(await work()); }
  catch (error) {
    if (error instanceof DomainError) return Response.json({error:error.code,message:error.message},{status:error.status});
    if (error instanceof ZodError) return Response.json({error:"INVALID_INPUT",issues:error.issues.map(i=>({path:i.path,message:i.message}))},{status:400});
    if (error instanceof SyntaxError) return Response.json({error:"INVALID_JSON"},{status:400});
    if (typeof error === "object" && error && "code" in error && ["23503","23505","23514"].includes(String(error.code)))
      return Response.json({error:"DATABASE_CONSTRAINT"},{status:409});
    console.error("StoryState API failed",error);
    return Response.json({error:"INTERNAL_ERROR"},{status:500});
  }
}
export async function storyRequest(service: StateService, method: "GET"|"POST", storyId: string, path: string[], request?: Request) {
  const key = path.join("/");
  if (method === "GET") {
    switch(key) {
      case "state": return service.getCurrentState(storyId);
      case "events": return service.getEvents(storyId);
      case "deltas": return service.getDeltas(storyId);
      case "versions": return service.getVersions(storyId);
      case "annotations": return service.getAnnotations(storyId);
    }
  } else {
    const body: unknown = await request?.json();
    if (key === "events") return service.appendEvent(storyId,body);
    if (key === "deltas") return service.proposeDelta(storyId,body);
    if (key === "commit") return service.commitAcceptedDeltas(storyId,body);
    if (key === "source-documents") return service.addSourceDocument(storyId,body);
    if (key === "source-revisions") return service.addSourceRevision(storyId,body);
    if (key === "evidence") return service.addEvidence(storyId,body);
    if (key === "annotations") return service.addAnnotation(storyId,body);
    if (path.length === 3 && path[0] === "deltas" && path[2] === "decision") return service.decideDelta(storyId,path[1],body);
    if (path.length === 3 && path[0] === "deltas" && path[2] === "validate") return service.validateDelta(storyId,path[1],body);
    if (path.length === 3 && path[0] === "versions" && path[2] === "restore") return service.restoreVersion(storyId,path[1],body);
  }
  throw new DomainError("NOT_FOUND","API operation not found",404);
}
