import { Pool, type PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { invariant } from "../domain/errors";
import { type CanonicalState, type StoryAggregate } from "../domain/state";
import type { StateRepository } from "./state-repository";

// One locked story is the serialization boundary. All statements use story_id; the
// database additionally enforces composite foreign keys across stories.
export class PostgresStateRepository implements StateRepository {
  constructor(private pool: Pool) {}
  async create(value: StoryAggregate) {
    await this.pool.query("insert into stories(id,title,current_version,current_chapter,story_revision,created_at) values ($1,$2,$3,$4,$5,$6)",
      [value.story.id,value.story.title,value.story.currentVersion,value.story.currentChapter,value.story.storyRevision,value.story.createdAt]);
  }
  async read(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const value = await this.load(client,id);
      await client.query("commit");
      return value;
    } catch(error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  async transaction<T>(id: string, work: (draft: StoryAggregate) => T) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query("select id from stories where id=$1 for update",[id]);
      invariant(locked.rowCount, "NOT_FOUND", "Story not found", 404);
      const before = await this.load(client,id);
      const draft = structuredClone(before);
      const result = work(draft);
      await this.save(client,before,draft);
      await client.query("commit");
      return structuredClone(result);
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  private async load(c: PoolClient, id: string): Promise<StoryAggregate> {
    const storyRow = (await c.query("select * from stories where id=$1",[id])).rows[0];
    invariant(storyRow, "NOT_FOUND", "Story not found", 404);
    const read = async (table: string) => (await c.query(`select * from ${table} where story_id=$1`,[id])).rows;
    const [docs,revisions,evidence,characters,items,threads,propositions,world,knowledge,relationships,events,participants,eventEvidence,deltas,deltaEvidence,decisions,versions,annotations,annotationEvidence] = await Promise.all([
      "source_documents","source_revisions","evidence","characters","items","plot_threads","propositions","world_truth_states","character_knowledge_states","relationships","events","event_participants","event_evidence","state_deltas","delta_evidence","delta_decisions","state_versions","derived_annotations","annotation_evidence"
    ].map(read));
    const iso = (v: Date | string) => new Date(v).toISOString();
    const epistemic = (r: Record<string, unknown>, prefix: string, last: string) => ({value:r[`${prefix}_value`] as string|null,status:r[`${prefix}_status`] as "resolved"|"unresolved",lastConfirmedValue:r[last] as string|null});
    const state: CanonicalState = {
      characters: characters.map(r=>({id:r.id,active:r.active,name:r.name,role:r.role,location:epistemic(r,"location","last_confirmed_location")})),
      items: items.map(r=>({id:r.id,active:r.active,name:r.name,owner:epistemic(r,"owner","owner_last_confirmed"),holder:epistemic(r,"holder","holder_last_confirmed"),custodian:r.custodian_status===null?null:epistemic(r,"custodian","custodian_last_confirmed"),condition:r.condition})),
      plotThreads: threads.map(r=>({id:r.id,active:r.active,title:r.title,coreQuestion:r.core_question,status:r.status,resolution:r.resolution})),
      propositions: propositions.map(r=>({id:r.id,active:r.active,statement:r.statement,kind:r.kind,reportedPropositionId:r.reported_proposition_id,reporterId:r.reporter_id})),
      worldTruth: world.map(r=>({id:r.id,active:r.active,propositionId:r.proposition_id,status:r.status})),
      knowledge: knowledge.map(r=>({id:r.id,active:r.active,characterId:r.character_id,propositionId:r.proposition_id,stance:r.stance,believedValue:r.believed_value,basis:r.basis})),
      relationships: relationships.map(r=>({id:r.id,active:r.active,fromCharacterId:r.from_character_id,toCharacterId:r.to_character_id,category:r.category,predicate:r.predicate,value:r.value,scope:r.scope,basis:r.basis})),
    };
    return {
      story:{id,title:storyRow.title,currentVersion:storyRow.current_version,currentChapter:storyRow.current_chapter,storyRevision:storyRow.story_revision,createdAt:iso(storyRow.created_at)},state,
      documents:docs.map(r=>({id:r.id,title:r.title,sourceOrder:r.source_order,chapter:r.chapter})),
      revisions:revisions.map(r=>({id:r.id,documentId:r.document_id,revisionNumber:r.revision_number,content:r.content,visibility:r.visibility})),
      evidence:evidence.map(r=>({id:r.id,sourceRevisionId:r.source_revision_id,quote:r.quote,start:r.start_offset,end:r.end_offset,speakerId:r.speaker_id})),
      events:events.map(r=>({id:r.id,sourceRevisionId:r.source_revision_id,sourceOrder:r.source_order,storyTime:r.story_time,eventType:r.event_type,summary:r.summary,payload:r.payload,createdAt:iso(r.created_at),participantIds:participants.filter(p=>p.event_id===r.id).map(p=>p.character_id),evidenceIds:eventEvidence.filter(e=>e.event_id===r.id).map(e=>e.evidence_id)})),
      deltas:deltas.map(r=>({id:r.id,operation:r.operation,targetType:r.target_type,targetId:r.target_id,fieldPath:r.field_path,before:r.before_value,after:r.after_value,sourceKind:r.source_kind,sourceEventId:r.source_event_id,effect:r.effect_id?{id:r.effect_id,description:r.effect_description}:null,evidenceIds:deltaEvidence.filter(e=>e.delta_id===r.id).map(e=>e.evidence_id),reason:r.reason,confidence:Number(r.confidence),risk:r.risk,proposedBy:r.proposed_by,basis:r.basis,resolutionSupport:r.resolution_support,decision:r.decision,validatorResult:r.validator_result,decisions:decisions.filter(d=>d.delta_id===r.id).sort((a,b)=>Number(a.id)-Number(b.id)).map(d=>({decision:d.decision,actor:d.actor,reason:d.reason,createdAt:iso(d.created_at)})),committedVersionId:r.committed_version_id,createdAt:iso(r.created_at)})),
      versions:versions.sort((a,b)=>a.version_number-b.version_number).map(r=>({id:r.id,versionNumber:r.version_number,parentVersionId:r.parent_version_id,commitKind:r.commit_kind,createdAt:iso(r.created_at),deltaIds:deltas.filter(d=>d.committed_version_id===r.id).map(d=>d.id),snapshot:r.snapshot,restoredFromVersionId:r.restored_from_version_id,chapter:r.chapter,storyRevision:r.story_revision})),
      annotations:annotations.map(r=>({id:r.id,sourceRevisionId:r.source_revision_id,targetType:r.target_type,targetId:r.target_id,evidenceIds:annotationEvidence.filter(e=>e.annotation_id===r.id).map(e=>e.evidence_id),content:r.content,confidence:Number(r.confidence),basis:r.basis,scope:r.scope,createdAt:iso(r.created_at),invalidatedAt:r.invalidated_at?iso(r.invalidated_at):null,supersededBy:r.superseded_by})),
    };
  }

  private async save(c: PoolClient, old: StoryAggregate, a: StoryAggregate) {
    const storyId = a.story.id;
    const insert = async (table: string, columns: string[], values: unknown[], upsert = false) => {
      const names = ["story_id",...columns];
      const updates = columns.filter(n=>n!=="id").map(n=>`${n}=excluded.${n}`).join(",");
      await c.query(`insert into ${table} (${names.join(",")}) values (${names.map((_,i)=>`$${i+1}`).join(",")}) ${upsert?`on conflict (story_id,id) do update set ${updates},updated_at=now()`:""}`,[storyId,...values]);
    };
    const fresh = <T extends {id:string}>(previous:T[], next:T[]) => next.filter(n=>!previous.some(p=>p.id===n.id));
    const changed = <T extends {id:string}>(previous:T[], next:T[]) => next.filter(n=>!isDeepStrictEqual(previous.find(p=>p.id===n.id),n));
    if (!isDeepStrictEqual(old.story,a.story)) await c.query("update stories set title=$2,current_version=$3,current_chapter=$4,story_revision=$5,updated_at=now() where id=$1",[storyId,a.story.title,a.story.currentVersion,a.story.currentChapter,a.story.storyRevision]);
    for(const d of fresh(old.documents,a.documents)) await insert("source_documents",["id","title","source_order","chapter"],[d.id,d.title,d.sourceOrder,d.chapter]);
    for(const r of fresh(old.revisions,a.revisions)) await insert("source_revisions",["id","document_id","revision_number","content","visibility"],[r.id,r.documentId,r.revisionNumber,r.content,r.visibility]);
    for(const r of changed(old.state.characters,a.state.characters)) await insert("characters",["id","name","role","location_value","location_status","last_confirmed_location","active"],[r.id,r.name,r.role,r.location.value,r.location.status,r.location.lastConfirmedValue,r.active],true);
    for(const e of fresh(old.evidence,a.evidence)) await insert("evidence",["id","source_revision_id","quote","start_offset","end_offset","speaker_id"],[e.id,e.sourceRevisionId,e.quote,e.start,e.end,e.speakerId]);
    for(const r of changed(old.state.items,a.state.items)) await insert("items",["id","name","owner_value","owner_status","owner_last_confirmed","holder_value","holder_status","holder_last_confirmed","custodian_value","custodian_status","custodian_last_confirmed","condition","active"],[r.id,r.name,r.owner.value,r.owner.status,r.owner.lastConfirmedValue,r.holder.value,r.holder.status,r.holder.lastConfirmedValue,r.custodian?.value??null,r.custodian?.status??null,r.custodian?.lastConfirmedValue??null,r.condition,r.active],true);
    for(const r of changed(old.state.plotThreads,a.state.plotThreads)) await insert("plot_threads",["id","title","core_question","status","resolution","active"],[r.id,r.title,r.coreQuestion,r.status,r.resolution,r.active],true);
    for(const r of changed(old.state.propositions,a.state.propositions)) await insert("propositions",["id","statement","kind","reported_proposition_id","reporter_id","active"],[r.id,r.statement,r.kind,r.reportedPropositionId,r.reporterId,r.active],true);
    for(const r of changed(old.state.worldTruth,a.state.worldTruth)) await insert("world_truth_states",["id","proposition_id","status","active"],[r.id,r.propositionId,r.status,r.active],true);
    for(const r of changed(old.state.knowledge,a.state.knowledge)) await insert("character_knowledge_states",["id","character_id","proposition_id","stance","believed_value","basis","active"],[r.id,r.characterId,r.propositionId,r.stance,r.believedValue,JSON.stringify(r.basis),r.active],true);
    for(const r of changed(old.state.relationships,a.state.relationships)) await insert("relationships",["id","from_character_id","to_character_id","category","predicate","value","scope","basis","active"],[r.id,r.fromCharacterId,r.toCharacterId,r.category,r.predicate,r.value,r.scope,JSON.stringify(r.basis),r.active],true);
    for(const e of fresh(old.events,a.events)) {
      await insert("events",["id","source_revision_id","source_order","story_time","event_type","summary","payload","created_at"],[e.id,e.sourceRevisionId,e.sourceOrder,e.storyTime,e.eventType,e.summary,JSON.stringify(e.payload),e.createdAt]);
      for(const id of e.participantIds) await c.query("insert into event_participants(story_id,event_id,character_id) values ($1,$2,$3)",[storyId,e.id,id]);
      for(const id of e.evidenceIds) await c.query("insert into event_evidence(story_id,event_id,evidence_id) values ($1,$2,$3)",[storyId,e.id,id]);
    }
    // Immutable snapshots precede delta links. Deferred FKs allow a single transaction.
    for(const v of fresh(old.versions,a.versions)) await insert("state_versions",["id","version_number","parent_version_id","commit_kind","chapter","story_revision","restored_from_version_id","snapshot","created_at"],[v.id,v.versionNumber,v.parentVersionId,v.commitKind,v.chapter,v.storyRevision,v.restoredFromVersionId,JSON.stringify(v.snapshot),v.createdAt]);
    for(const d of fresh(old.deltas,a.deltas)) {
      await insert("state_deltas",["id","operation","target_type","target_id","field_path","before_value","after_value","source_kind","source_event_id","effect_id","effect_description","reason","confidence","risk","proposed_by","basis","resolution_support","decision","validator_result","committed_version_id","created_at"],
        [d.id,d.operation,d.targetType,d.targetId,d.fieldPath,JSON.stringify(d.before),JSON.stringify(d.after),d.sourceKind,d.sourceEventId,d.effect?.id??null,d.effect?.description??null,d.reason,d.confidence,JSON.stringify(d.risk),d.proposedBy,JSON.stringify(d.basis),d.resolutionSupport?JSON.stringify(d.resolutionSupport):null,d.decision,d.validatorResult?JSON.stringify(d.validatorResult):null,d.committedVersionId,d.createdAt]);
      for(const evidenceId of d.evidenceIds) await c.query("insert into delta_evidence(story_id,delta_id,evidence_id) values ($1,$2,$3)",[storyId,d.id,evidenceId]);
    }
    for(const d of a.deltas) {
      const prior = old.deltas.find(p=>p.id===d.id);
      if(prior && (prior.decision!==d.decision || !isDeepStrictEqual(prior.validatorResult,d.validatorResult) || prior.committedVersionId!==d.committedVersionId))
        await c.query("update state_deltas set decision=$3,validator_result=$4,committed_version_id=$5 where story_id=$1 and id=$2",[storyId,d.id,d.decision,d.validatorResult?JSON.stringify(d.validatorResult):null,d.committedVersionId]);
      for(const decision of d.decisions.slice(prior?.decisions.length??0)) await c.query("insert into delta_decisions(story_id,delta_id,decision,actor,reason,created_at) values ($1,$2,$3,$4,$5,$6)",[storyId,d.id,decision.decision,decision.actor,decision.reason,decision.createdAt]);
    }
    for(const n of fresh(old.annotations,a.annotations)) {
      await insert("derived_annotations",["id","source_revision_id","target_type","target_id","content","confidence","basis","scope","invalidated_at","superseded_by","created_at"],[n.id,n.sourceRevisionId,n.targetType,n.targetId,n.content,n.confidence,JSON.stringify(n.basis),JSON.stringify(n.scope),n.invalidatedAt,n.supersededBy,n.createdAt]);
      for(const evidenceId of n.evidenceIds) await c.query("insert into annotation_evidence(story_id,annotation_id,evidence_id) values ($1,$2,$3)",[storyId,n.id,evidenceId]);
    }
    for(const n of a.annotations) if(n.invalidatedAt && !old.annotations.find(p=>p.id===n.id)?.invalidatedAt)
      await c.query("update derived_annotations set invalidated_at=$3 where story_id=$1 and id=$2",[storyId,n.id,n.invalidatedAt]);
  }
}
