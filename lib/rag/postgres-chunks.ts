import type { Pool } from "pg";
import type { EvidenceChunk } from "./chunks";
import { RAG_LIMITS, type ChunkRepository, type RetrievalScope } from "./retrieval";
import { VECTORIZER_VERSION } from "./vectorizer";

export class PostgresChunkRepository implements ChunkRepository {
  constructor(private readonly pool: Pool) {}

  async index(chunks: EvidenceChunk[]) {
    if (!chunks.length) return { created: 0, skipped: 0 };
    const client = await this.pool.connect();
    let created = 0;
    try {
      await client.query("begin");
      for (const c of chunks) {
        const result = await client.query(`
          insert into story_evidence_chunks
            (id,story_id,source_document_id,source_revision_id,source_order,chapter,chunk_index,
             start_offset,end_offset,content,content_hash,retrieval_vector,vectorizer_version)
          select $1,$2,d.id,r.id,d.source_order,d.chapter,$5,$6,$7,$8,$9,$10::vector,$11
          from source_revisions r join source_documents d on d.story_id=r.story_id and d.id=r.document_id
          where r.story_id=$2 and r.id=$3 and d.id=$4 and r.visibility='canonical'
            and position($8 in r.content)>0
          on conflict (story_id,source_revision_id,chunk_index,vectorizer_version) do nothing
          returning id`,
        [c.id, c.storyId, c.sourceRevisionId, c.sourceDocumentId, c.chunkIndex,
          c.start, c.end, c.content, c.contentHash, JSON.stringify(c.vector), VECTORIZER_VERSION]);
        // FK/SELECT conditions must not silently "index" a foreign or hidden source.
        if (!result.rowCount) {
          const existing = await client.query(
            "select id from story_evidence_chunks where id=$1 and story_id=$2 and content_hash=$3",
            [c.id, c.storyId, c.contentHash]);
          if (!existing.rowCount) throw new Error("RAG_INDEX_SOURCE_MISMATCH");
        }
        created += result.rowCount ?? 0;
      }
      await client.query("commit");
      return { created, skipped: chunks.length - created };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async candidates(scope: RetrievalScope): Promise<EvidenceChunk[]> {
    if (!scope.eligibleRevisionIds.length) return [];
    const result = await this.pool.query(`
      with eligible as materialized (
        select c.* from story_evidence_chunks c
        join source_revisions r on r.story_id=c.story_id and r.id=c.source_revision_id
        join source_documents d on d.story_id=r.story_id and d.id=r.document_id
        where c.story_id=$1 and c.source_revision_id=any($2::uuid[])
          and c.source_revision_id<>$3 and c.source_order<$4 and d.source_order=c.source_order
          and c.source_document_id=d.id and r.visibility='canonical' and c.vectorizer_version=$8
          and not exists (select 1 from source_revisions newer
            where newer.story_id=r.story_id and newer.document_id=r.document_id
              and newer.revision_number>r.revision_number)
      ),
      vector_pool as (select * from eligible order by retrieval_vector <#> $5::vector, id limit $7),
      recent_pool as (select * from eligible order by source_order desc, chunk_index desc, id limit $7),
      entity_pool as (
        select * from eligible where exists
          (select 1 from unnest($6::text[]) n where position(lower(n) in lower(content))>0)
        order by source_order desc, chunk_index desc, id limit $7
      )
      select * from vector_pool union all select * from recent_pool union all select * from entity_pool`,
    [scope.storyId, scope.eligibleRevisionIds, scope.currentRevisionId, scope.beforeSourceOrder,
      JSON.stringify(scope.queryVector), scope.entityNames, RAG_LIMITS.poolPerSignal, VECTORIZER_VERSION]);
    return result.rows.map(r => ({
      id: r.id, storyId: r.story_id, sourceDocumentId: r.source_document_id,
      sourceRevisionId: r.source_revision_id, sourceOrder: r.source_order, chapter: r.chapter,
      chunkIndex: r.chunk_index, start: r.start_offset, end: r.end_offset,
      content: r.content, contentHash: r.content_hash, vectorizerVersion: r.vectorizer_version,
      vector: typeof r.retrieval_vector === "string" ? JSON.parse(r.retrieval_vector) : r.retrieval_vector,
    }));
  }
}
