import { productionPool } from "../lib/server/api";
import { chunksForRevision } from "../lib/rag/chunks";
import { PostgresChunkRepository } from "../lib/rag/postgres-chunks";

async function main() {
  const pool = productionPool();
  const rows = await pool.query(`
    select r.id as revision_id, r.story_id, r.document_id, r.revision_number,
           r.content, r.visibility, d.title, d.source_order, d.chapter
    from source_revisions r
    join source_documents d on d.story_id=r.story_id and d.id=r.document_id
    where r.visibility='canonical'
    order by r.story_id, d.source_order, r.revision_number, r.id
  `);
  const repository = new PostgresChunkRepository(pool);
  let chunksCreated = 0;
  let chunksSkipped = 0;
  for (const row of rows.rows) {
    const chunks = chunksForRevision(row.story_id, {
      id: row.document_id, title: row.title, sourceOrder: row.source_order, chapter: row.chapter,
    }, {
      id: row.revision_id, documentId: row.document_id, revisionNumber: row.revision_number,
      content: row.content, visibility: row.visibility,
    });
    const result = await repository.index(chunks);
    chunksCreated += result.created;
    chunksSkipped += result.skipped;
  }
  console.log(JSON.stringify({
    sourceRevisionsScanned: rows.rowCount ?? rows.rows.length,
    chunksCreated, chunksDeduped: chunksSkipped, backfill: "PASS",
  }));
}

void main();
