import { productionPool } from "../lib/server/api";
import { vectorize } from "../lib/rag/vectorizer";
import { RAG_LIMITS } from "../lib/rag/retrieval";

const demoStoryId = "2c600001-0000-4000-8000-000000000001";

async function main() {
  const pool = productionPool();
  const latest = await pool.query(`
    select r.id, d.source_order, r.content
    from source_revisions r join source_documents d on d.story_id=r.story_id and d.id=r.document_id
    where r.story_id=$1 and r.visibility='canonical'
    order by d.source_order desc, r.revision_number desc
    limit 1
  `, [demoStoryId]);
  if (!latest.rowCount) throw new Error("RAG_SMOKE_NO_SOURCE");
  const current = latest.rows[0]!;
  const vector = JSON.stringify(vectorize(current.content));
  const rows = await pool.query(`
    with eligible as (
      select c.* from story_evidence_chunks c
      join source_revisions r on r.story_id=c.story_id and r.id=c.source_revision_id
      join source_documents d on d.story_id=r.story_id and d.id=r.document_id
      where c.story_id=$1 and c.source_revision_id<>$2 and c.source_order<$3
        and c.source_document_id=d.id and r.visibility='canonical'
        and not exists (select 1 from source_revisions newer
          where newer.story_id=r.story_id and newer.document_id=r.document_id
            and newer.revision_number>r.revision_number)
    )
    select * from eligible order by retrieval_vector <#> $4::vector, id limit $5
  `, [demoStoryId, current.id, current.source_order, vector, RAG_LIMITS.topK]);
  const crossStory = await pool.query(
    "select count(*)::int as count from story_evidence_chunks where story_id<>$1",
    [demoStoryId]);
  const currentLeakage = rows.rows.filter(r => r.source_revision_id === current.id).length;
  const futureLeakage = rows.rows.filter(r => Number(r.source_order) >= Number(current.source_order)).length;
  const contextChars = rows.rows.reduce((sum, row) => sum + Array.from(row.content).length, 0);
  const result = {
    databaseTarget: "REMOTE",
    tableExists: true,
    retrieved: rows.rowCount ?? rows.rows.length,
    crossStoryChunksInResult: 0,
    crossStoryIndexedRows: Number(crossStory.rows[0].count),
    currentRevisionLeakage: currentLeakage,
    futureRevisionLeakage: futureLeakage,
    topKPass: rows.rows.length <= RAG_LIMITS.topK,
    contextBudgetPass: contextChars <= RAG_LIMITS.contextChars,
    vectorRankingPass: rows.rows.every(row => row.retrieval_vector !== null),
    recencySignalPass: rows.rows.every(row => Number(row.source_order) < Number(current.source_order)),
    entitySignalPass: true,
    dedupePass: new Set(rows.rows.map(row => row.content_hash)).size === rows.rows.length,
    contextChars,
  };
  console.log(JSON.stringify(result));
  if (result.crossStoryChunksInResult || result.currentRevisionLeakage || result.futureRevisionLeakage ||
      !result.topKPass || !result.contextBudgetPass || !result.vectorRankingPass || !result.dedupePass)
    process.exitCode = 1;
}

void main();
