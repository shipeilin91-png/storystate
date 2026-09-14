import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { PostgresStateRepository } from "../lib/repositories/postgres-state-repository";
import type { StateRepository } from "../lib/repositories/state-repository";
import { StateService } from "../lib/server/state-service";
import { respond, storyRequest } from "../lib/server/api";
import type { CanonicalState, DeltaInput, StateDelta } from "../lib/domain/state";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12,"0")}`;
const SID=id(1), LIN=id(2), CHEN=id(3), GU=id(4), USB=id(5), THREAD=id(6), P=id(7), Q=id(8), R=id(9), KNOW_LP=id(10), KNOW_LQ=id(11), KNOW_GP=id(12), KNOW_GR=id(13), WORLD_P=id(14), FATHER_P=id(15), FATHER_WORLD=id(16), FATHER_LIN=id(17), TRUST=id(18), COOP=id(19), FRAGMENT=id(20);
const human = {kinds:["human_confirmation"],note:"Human-confirmed benchmark seed"};
const epistemic = (value:string|null,lastConfirmedValue=value) => ({value,status:value===null?"unresolved":"resolved",lastConfirmedValue});
const character = (uuid:string,name:string,location:string) => ({id:uuid,active:true,name,role:"character",location:epistemic(location)});
const item = (uuid:string,name:string,owner:string|null,holder:string) => ({id:uuid,active:true,name,owner:epistemic(owner),holder:epistemic(holder),condition:"encrypted"});
const knowledge = (uuid:string,characterId:string,propositionId:string,stance:string,believedValue:boolean|null,basis=human) => ({id:uuid,active:true,characterId,propositionId,stance,believedValue,basis});
const prop = (uuid:string,statement:string,kind="assertion",reportedPropositionId:string|null=null,reporterId:string|null=null) => ({id:uuid,active:true,statement,kind,reportedPropositionId,reporterId});
const thread = {id:THREAD,active:true,title:"USB Mystery",coreQuestion:"USB 中藏着什么货船线索？",status:"open",resolution:null};
const pText = "陈默是市刑侦支队警察，并正在港务安保中卧底";
const qText = "陈默公开身份不完整";
type Target = keyof CanonicalState;
const source = "陈默把 USB 放进林夏手里。顾言查看证件，陈默亲口说出身份。林夏说父亲去过 C-19。USB 解密证明父亲没有去过 C-19。";
async function setup(repository:StateRepository = new MemoryStateRepository(), storyId=SID) {
  const service = new StateService(repository);
  await service.createStory({id:storyId,title:"Benchmark Pilot"});
  await service.addSourceDocument(storyId,{id:id(101),title:"Chapter 13",sourceOrder:13,chapter:13});
  await service.addSourceRevision(storyId,{id:id(102),documentId:id(101),revisionNumber:1,content:source,visibility:"canonical"});
  await service.addEvidence(storyId,{id:id(103),sourceRevisionId:id(102),quote:source.slice(0,16),start:0,end:16,speakerId:null});
  return {service,storyId};
}
const proposal = (targetType:Target,targetId:string,operation:DeltaInput["operation"],before:unknown,after:unknown,fieldPath="$",extra:Partial<DeltaInput>={}) => ({
  operation,targetType,targetId,fieldPath,before,after,sourceKind:"human_correction",sourceEventId:null,effect:null,evidenceIds:[],reason:"Benchmark-governed change",confidence:1,risk:[],proposedBy:"human",basis:human,resolutionSupport:null,...extra,
});
async function add(service:StateService,storyId:string,input:ReturnType<typeof proposal>,decision="accepted") {
  const delta = await service.proposeDelta(storyId,input);
  if (decision) await service.decideDelta(storyId,delta.id,{decision,actor:"reviewer",reason:"Reviewed"});
  return delta;
}
async function commit(service:StateService,storyId:string,deltas:StateDelta[],expectedVersion:number) {
  return service.commitAcceptedDeltas(storyId,{deltaIds:deltas.map(d=>d.id),expectedVersion});
}
async function seed(service:StateService,storyId:string) {
  const records:[Target,ReturnType<typeof character>|ReturnType<typeof item>|typeof thread|ReturnType<typeof knowledge>|ReturnType<typeof prop>|Record<string,unknown>][] = [
    ["characters",character(LIN,"林夏","Hospital")],["characters",character(CHEN,"陈默","Hospital")],["characters",character(GU,"顾言","Hospital")],
    ["items",item(USB,"加密 USB",CHEN,CHEN)],["plotThreads",thread],
    ["propositions",prop(P,pText)],["propositions",prop(Q,qText)],["worldTruth",{id:WORLD_P,active:true,propositionId:P,status:"unresolved"}],
    ["knowledge",knowledge(KNOW_LP,LIN,P,"unaware",null)],["knowledge",knowledge(KNOW_LQ,LIN,Q,"unaware",null)],
    ["relationships",{id:TRUST,active:true,fromCharacterId:LIN,toCharacterId:CHEN,category:"human_confirmed_psychological",predicate:"long_term_trust",value:"distrust",scope:"continuing",basis:human}],
  ];
  const deltas=[];
  for(const [targetType,row] of records) deltas.push(await add(service,storyId,proposal(targetType,row.id as string,"CREATE",null,row)));
  await commit(service,storyId,deltas,0);
}
const state = async (service:StateService,storyId=SID) => (await service.getCurrentState(storyId)).state;

test("Ch13: Event append is inert; holder, thread and Q change, owner and Lin/P remain",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const before=structuredClone(await state(service));
  const e=await service.appendEvent(storyId,{sourceRevisionId:id(102),sourceOrder:13,storyTime:null,eventType:"handoff",summary:"USB handoff",payload:{object:"USB"},participantIds:[LIN,CHEN],evidenceIds:[id(103)]});
  assert.deepEqual(await state(service),before);
  assert.equal((await service.getCurrentState(storyId)).story.currentVersion,1);
  const oldItem=before.items[0], oldThread=before.plotThreads[0], oldQ=before.knowledge.find(k=>k.id===KNOW_LQ)!;
  const fromEvent={sourceKind:"story_event" as const,sourceEventId:e.id,effect:{id:id(104),description:"Physical handoff"},evidenceIds:[id(103)]};
  const deltas=[
    await add(service,storyId,proposal("items",USB,"UPDATE",oldItem.holder,epistemic(LIN),"holder",fromEvent)),
    await add(service,storyId,proposal("plotThreads",THREAD,"UPDATE",oldThread.status,"progressing","status")),
    await add(service,storyId,proposal("knowledge",KNOW_LQ,"UPDATE",oldQ,{...oldQ,stance:"suspects"})),
  ];
  await commit(service,storyId,deltas,1);
  const result=await state(service);
  assert.equal(result.items[0].holder.value,LIN); assert.equal(result.items[0].owner.value,CHEN);
  assert.equal(result.plotThreads[0].status,"progressing");
  assert.equal(result.knowledge.find(k=>k.id===KNOW_LP)?.stance,"unaware");
  assert.equal(result.knowledge.find(k=>k.id===KNOW_LQ)?.stance,"suspects");
  assert.equal((await service.getVersions(storyId)).length,2);
});

test("Ch14: unresolved location preserves last confirmed Hospital; no sentinel domain value",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const old=(await state(service)).characters.find(c=>c.id===CHEN)!;
  const d=await add(service,storyId,proposal("characters",CHEN,"UPDATE",old.location,epistemic(null,"Hospital"),"location"));
  await commit(service,storyId,[d],1);
  assert.deepEqual((await state(service)).characters.find(c=>c.id===CHEN)?.location,{value:null,status:"unresolved",lastConfirmedValue:"Hospital"});
  await assert.rejects(service.proposeDelta(storyId,proposal("characters",CHEN,"UPDATE",epistemic(null,"Hospital"),epistemic("Unknown"),"location")));
});

test("Ch15: belief differs from World Truth, reported proposition R and fragment CREATE",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  await assert.rejects(service.proposeDelta(storyId,proposal("items",FRAGMENT,"UPDATE",null,item(FRAGMENT,"fragment",null,LIN))));
  const old=(await state(service)).knowledge.find(k=>k.id===KNOW_LP)!;
  const deltas=[
    await add(service,storyId,proposal("items",FRAGMENT,"CREATE",null,item(FRAGMENT,"fragment",null,LIN))),
    await add(service,storyId,proposal("knowledge",KNOW_LP,"UPDATE",old,{...old,stance:"believes",believedValue:true})),
    await add(service,storyId,proposal("propositions",R,"CREATE",null,prop(R,"林夏声称陈默是卧底","reported",P,LIN))),
    await add(service,storyId,proposal("knowledge",KNOW_GR,"CREATE",null,knowledge(KNOW_GR,GU,R,"knows",true,{kinds:["reported_claim"],note:"Gu heard Lin claim P"}))),
  ];
  await commit(service,storyId,deltas,1);
  const s=await state(service);
  assert.equal(s.worldTruth.find(w=>w.propositionId===P)?.status,"unresolved");
  assert.equal(s.knowledge.find(k=>k.id===KNOW_LP)?.believedValue,true);
  assert.equal(s.knowledge.find(k=>k.characterId===GU && k.propositionId===P),undefined);
  assert.equal(s.knowledge.find(k=>k.characterId===GU && k.propositionId===R)?.stance,"knows");
  assert.deepEqual(s.items.find(i=>i.id===FRAGMENT)?.owner,epistemic(null));
  assert.equal(s.items.find(i=>i.id===FRAGMENT)?.holder.value,LIN);
  const duplicate=await add(service,storyId,proposal("items",FRAGMENT,"CREATE",null,item(FRAGMENT,"fragment",null,LIN)));
  await assert.rejects(commit(service,storyId,[duplicate],2),/before value/);
});

test("Ch16: Gu knows exact P by disclosure and credential; Lin P unaffected, Q independent",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const s=await state(service), oldQ=s.knowledge.find(k=>k.id===KNOW_LQ)!;
  const ds=[await add(service,storyId,proposal("knowledge",KNOW_GP,"CREATE",null,knowledge(KNOW_GP,GU,P,"knows",true,{kinds:["direct_disclosure","credential_inspection"],note:"Direct identity proof"}))),await add(service,storyId,proposal("knowledge",KNOW_LQ,"UPDATE",oldQ,{...oldQ,stance:"suspects"}))];
  await commit(service,storyId,ds,1);
  const after=await state(service);
  assert.equal(after.propositions.find(p=>p.id===P)?.statement,pText);
  assert.equal(after.knowledge.find(k=>k.id===KNOW_GP)?.stance,"knows");
  assert.equal(after.knowledge.find(k=>k.id===KNOW_LP)?.stance,"unaware");
  assert.equal(after.knowledge.find(k=>k.id===KNOW_LQ)?.stance,"suspects");
});

test("Ch17: false belief correction, direct thread answer, bounded cooperation, long-term distrust unchanged",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const baseline=await state(service);
  const preparatory=[await add(service,storyId,proposal("propositions",FATHER_P,"CREATE",null,prop(FATHER_P,"林夏父亲三天前亲自到 C-19，并亲手留下残页"))),await add(service,storyId,proposal("worldTruth",FATHER_WORLD,"CREATE",null,{id:FATHER_WORLD,active:true,propositionId:FATHER_P,status:"unresolved"})),await add(service,storyId,proposal("knowledge",FATHER_LIN,"CREATE",null,knowledge(FATHER_LIN,LIN,FATHER_P,"believes",true))),await add(service,storyId,proposal("items",USB,"UPDATE",baseline.items[0].condition,"index_unlocked","condition")),await add(service,storyId,proposal("plotThreads",THREAD,"UPDATE",baseline.plotThreads[0].status,"progressing","status"))];
  await commit(service,storyId,preparatory,1);
  const s=await state(service), belief=s.knowledge.find(k=>k.id===FATHER_LIN)!, world=s.worldTruth.find(w=>w.id===FATHER_WORLD)!, usb=s.items.find(i=>i.id===USB)!, oldThread=s.plotThreads[0];
  const correction={...belief,stance:"knows",believedValue:false,basis:{kinds:["documentary_evidence"],note:"USB decrypt disproves father visit",correction:{previousStance:"believes",previousBelievedValue:true,evidenceIds:[id(103)]}}};
  const ds=[
    await add(service,storyId,proposal("worldTruth",FATHER_WORLD,"UPDATE",world.status,"confirmed_false","status")),
    await add(service,storyId,proposal("knowledge",FATHER_LIN,"UPDATE",belief,correction,"$",{evidenceIds:[id(103)]})),
    await add(service,storyId,proposal("items",USB,"UPDATE",usb.condition,"decrypted","condition")),
    await add(service,storyId,proposal("plotThreads",THREAD,"RESOLVE",oldThread,{...oldThread,status:"resolved",resolution:"货船线索已直接解出"},"$",{evidenceIds:[id(103)],resolutionSupport:{coreQuestion:oldThread.coreQuestion,answer:"货船线索已直接解出",evidenceIds:[id(103)],assessment:"direct_answer"}})),
    await add(service,storyId,proposal("relationships",COOP,"CREATE",null,{id:COOP,active:true,fromCharacterId:LIN,toCharacterId:CHEN,category:"explicit_operational",predicate:"bounded_cooperation",value:"active",scope:"current escape",basis:human})),
    await add(service,storyId,proposal("relationships",TRUST,"NO_CHANGE","distrust","distrust","value")),
  ];
  await commit(service,storyId,ds,2);
  const result=await state(service);
  assert.equal(result.worldTruth.find(w=>w.id===FATHER_WORLD)?.status,"confirmed_false");
  assert.equal(result.knowledge.find(k=>k.id===FATHER_LIN)?.stance,"knows");
  assert.equal(result.knowledge.find(k=>k.id===FATHER_LIN)?.believedValue,false);
  assert.equal(result.relationships.find(r=>r.id===TRUST)?.value,"distrust");
  assert.equal(result.relationships.find(r=>r.id===COOP)?.scope,"current escape");
  assert.equal(result.items.find(i=>i.id===USB)?.condition,"decrypted");
  assert.equal(result.plotThreads.find(t=>t.id===THREAD)?.status,"resolved");
  assert.ok((await service.getDeltas(storyId)).some(d=>d.targetId===TRUST && d.operation==="NO_CHANGE" && d.committedVersionId));
});

test("author-only hidden truth cannot become event or evidence-backed canonical state",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const hidden="hidden_author_truth: father did not visit C-19";
  await service.addSourceRevision(storyId,{id:id(301),documentId:id(101),revisionNumber:2,content:hidden,visibility:"author_only"});
  await service.addEvidence(storyId,{id:id(302),sourceRevisionId:id(301),quote:hidden,start:0,end:hidden.length,speakerId:null});
  await assert.rejects(service.appendEvent(storyId,{sourceRevisionId:id(301),sourceOrder:13,storyTime:null,eventType:"secret",summary:"Author-only",payload:{},participantIds:[],evidenceIds:[id(302)]}),/Author-only/);
  const old=(await state(service)).worldTruth[0];
  await assert.rejects(service.proposeDelta(storyId,proposal("worldTruth",WORLD_P,"UPDATE",old.status,"confirmed_false","status",{evidenceIds:[id(302)]})),/Author-only/);
  assert.equal((await state(service)).worldTruth[0].status,"unresolved");
});

test("governance: rejected, deferred and needs_review stay audited; recommendation never decides for a human",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const old=(await state(service)).characters.find(c=>c.id===LIN)!;
  const ds=[];
  for(const decision of ["rejected","deferred","needs_review"])
    ds.push(await add(service,storyId,proposal("characters",LIN,"UPDATE",old.location,epistemic("Dock"),"location"),decision));
  const optional=await service.proposeDelta(storyId,proposal("characters",LIN,"UPDATE",old.location,epistemic("Pier"),"location"));
  await service.setValidatorResult(storyId,optional.id,{status:"passed",recommendation:"AUTO_ACCEPT_ELIGIBLE",reason:"Evidence suffices",risk:"LOW"});
  await service.decideDelta(storyId,optional.id,{decision:"rejected",actor:"human",reason:"Different interpretation"});
  await assert.rejects(commit(service,storyId,ds,1),/accepted/);
  assert.equal((await state(service)).characters.find(c=>c.id===LIN)?.location.value,"Hospital");
  assert.equal((await service.getDeltas(storyId)).filter(d=>d.decision!=="accepted").length,4);
});

test("stale-before and unresolved validator conflict roll back entire batch",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const s=await state(service),old=s.items[0];
  const first=await add(service,storyId,proposal("items",USB,"UPDATE",old.holder,epistemic(LIN),"holder"));
  const conflict=await service.proposeDelta(storyId,proposal("items",USB,"UPDATE",old.condition,"decrypted","condition"));
  await service.setValidatorResult(storyId,conflict.id,{status:"conflict",recommendation:"CONFLICT",reason:"Needs correction",risk:"CONFLICT"});
  await assert.rejects(service.decideDelta(storyId,conflict.id,{decision:"accepted",actor:"human",reason:"Force"}),/conflict/i);
  await assert.rejects(commit(service,storyId,[first,conflict],1),/accepted/);
  assert.deepEqual(await state(service),s);
  await commit(service,storyId,[first],1);
  const stale=await add(service,storyId,proposal("items",USB,"UPDATE",old.holder,epistemic(GU),"holder"));
  await assert.rejects(commit(service,storyId,[stale],2),/before value/);
  assert.equal((await service.getCurrentState(storyId)).story.currentVersion,2);
  assert.equal((await state(service)).items[0].holder.value,LIN);
});

test("NO_CHANGE-only has no version; changed operation cannot disguise a no-op; soft annotation invalidates on source revision",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const trust=(await state(service)).relationships[0];
  const unchanged=await add(service,storyId,proposal("relationships",TRUST,"NO_CHANGE",trust.value,trust.value,"value"));
  await assert.rejects(commit(service,storyId,[unchanged],1),/real canonical mutation/);
  await assert.rejects(service.proposeDelta(storyId,proposal("relationships",TRUST,"UPDATE",trust.value,trust.value,"value")),/change canonical state/);
  const annotation=await service.addAnnotation(storyId,{id:id(200),sourceRevisionId:id(102),targetType:"relationships",targetId:TRUST,evidenceIds:[id(103)],content:"Perhaps trust is improving",confidence:.3,basis:{kinds:["inference"],note:"Soft reading"},scope:{chapter:13}});
  assert.equal(annotation.invalidatedAt,null);
  assert.equal((await service.getCurrentState(storyId)).story.currentVersion,1);
  await service.addSourceRevision(storyId,{id:id(201),documentId:id(101),revisionNumber:2,content:"Revised source",visibility:"canonical"});
  assert.ok((await service.getAnnotations(storyId))[0].invalidatedAt);
  assert.equal((await service.getCurrentState(storyId)).story.storyRevision,2);
});

test("restore generates governed deltas, new version and full immutable history; chapter and story revision remain separate",async()=>{
  const {service,storyId}=await setup(); await seed(service,storyId);
  const prior=(await service.getVersions(storyId))[0];
  const old=(await state(service)).items[0];
  const d=await add(service,storyId,proposal("items",USB,"UPDATE",old.holder,epistemic(LIN),"holder"));
  await commit(service,storyId,[d],1);
  const restored=await service.restoreVersion(storyId,prior.id,{expectedVersion:2,actor:"human",reason:"Restore old snapshot"});
  assert.equal(restored.versionNumber,3); assert.equal(restored.restoredFromVersionId,prior.id);
  assert.equal(restored.chapter,13); assert.equal(restored.storyRevision,1);
  assert.deepEqual((await service.getVersions(storyId)).map(v=>v.versionNumber),[1,2,3]);
  assert.equal((await state(service)).items[0].holder.value,CHEN);
  assert.ok((await service.getDeltas(storyId)).some(d=>d.sourceKind==="restore" && d.committedVersionId===restored.id));
  await assert.rejects(service.restoreVersion(storyId,prior.id,{expectedVersion:3,actor:"human",reason:"Same state"}),/identical snapshot/);
  assert.equal((await service.getVersions(storyId)).length,3);
});

test("two stories have isolated data, events, versions and cross-story references",async()=>{
  const repository=new MemoryStateRepository();
  const a=await setup(repository,SID), b=await setup(repository,id(900));
  await seed(a.service,a.storyId);
  assert.equal((await b.service.getCurrentState(b.storyId)).story.currentVersion,0);
  await assert.rejects(b.service.getDeltas(id(901)),/not found/i);
  await assert.rejects(b.service.addEvidence(b.storyId,{id:id(300),sourceRevisionId:id(102),quote:"wrong",start:0,end:5,speakerId:LIN}),/Speaker|Evidence/);
  assert.deepEqual((await state(b.service,b.storyId)).characters,[]);
});

test("migration and production repository: typed rows, transaction rollback, FK isolation, append-only ledger and API dispatch",async()=>{
  const db=new PGlite();
  try {
    await db.exec(await readFile("supabase/migrations/20260914000100_canonical_state_foundation.sql","utf8"));
    // PGlite speaks PostgreSQL and exposes the same query/transaction surface used by pg.
    const connection={query:(sql:string,args?:unknown[])=>db.query(sql,args),release:()=>{}};
    const pool={query:connection.query,connect:async()=>connection} as unknown as Pool;
    const repository=new PostgresStateRepository(pool);
    const {service,storyId}=await setup(repository);
    await seed(service,storyId);
    assert.equal((await state(service)).items[0].owner.value,CHEN);
    const s=await state(service),old=s.items[0];
    const event=await service.appendEvent(storyId,{sourceRevisionId:id(102),sourceOrder:13,storyTime:null,eventType:"handoff",summary:"Event only",payload:{who:"Lin"},participantIds:[LIN],evidenceIds:[id(103)]});
    assert.equal((await service.getCurrentState(storyId)).story.currentVersion,1);
    const d=await add(service,storyId,proposal("items",USB,"UPDATE",old.holder,epistemic(LIN),"holder",{sourceKind:"story_event",sourceEventId:event.id,effect:{id:id(104),description:"Holder changed"},evidenceIds:[id(103)]}));
    await commit(service,storyId,[d],1);
    assert.equal((await state(service)).items[0].holder.value,LIN);
    const provenance=await db.query("select e.id as event_id, x.id as delta_id, v.version_number, ev.quote from events e join state_deltas x on x.story_id=e.story_id and x.source_event_id=e.id join state_versions v on v.story_id=x.story_id and v.id=x.committed_version_id join delta_evidence de on de.story_id=x.story_id and de.delta_id=x.id join evidence ev on ev.story_id=de.story_id and ev.id=de.evidence_id where e.story_id=$1",[storyId]);
    const provenanceRow=provenance.rows[0] as {version_number:number;event_id:string};
    assert.equal(provenanceRow.version_number,2); assert.equal(provenanceRow.event_id,event.id);
    const duplicate=await add(service,storyId,proposal("items",USB,"CREATE",null,old));
    await assert.rejects(commit(service,storyId,[duplicate],2),/before value/);
    assert.equal((await service.getVersions(storyId)).length,2);
    assert.equal((await service.getCurrentState(storyId)).story.currentVersion,2);
    await assert.rejects(db.query("update events set summary='tampered' where story_id=$1 and id=$2",[storyId,event.id]),/append-only/);
    await assert.rejects(db.query("update state_deltas set reason='tampered' where story_id=$1 and id=$2",[storyId,d.id]),/provenance is immutable/);
    await assert.rejects(db.query("delete from event_evidence where story_id=$1 and event_id=$2",[storyId,event.id]),/append-only/);
    await assert.rejects(db.query("insert into items(story_id,id,name,owner_status,holder_status,condition) values ($1,$2,'bad','invalid','unresolved','encrypted')",[storyId,id(500)]),/check constraint/);
    const other=await setup(repository,id(900));
    await assert.rejects(db.query("insert into event_evidence(story_id,event_id,evidence_id) values ($1,$2,$3)",[other.storyId,event.id,id(103)]),/foreign key/);
    const response=await respond(()=>storyRequest(service,"GET",storyId,["state"]));
    assert.equal(response.status,200);
    assert.equal((await response.json()).story.currentVersion,2);
    const invalid=await respond(()=>storyRequest(service,"POST",storyId,["deltas"],new Request("http://localhost/api",{method:"POST",body:"{}"})));
    assert.equal(invalid.status,400);
  } finally {await db.close();}
});
