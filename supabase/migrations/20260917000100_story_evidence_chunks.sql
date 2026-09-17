-- Additive, context-only index. No changes to Canonical State or its ledger.
create extension if not exists vector;

create table if not exists story_evidence_chunks (
  id uuid primary key,
  story_id uuid not null references stories(id),
  source_document_id uuid not null,
  source_revision_id uuid not null,
  source_order integer not null check (source_order >= 0),
  chapter integer,
  chunk_index integer not null check (chunk_index >= 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  content text not null check (length(trim(content)) > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  retrieval_vector vector(384) not null,
  vectorizer_version text not null,
  created_at timestamptz not null default now(),
  foreign key (story_id,source_document_id) references source_documents(story_id,id),
  foreign key (story_id,source_revision_id) references source_revisions(story_id,id),
  unique (story_id,source_revision_id,chunk_index,vectorizer_version)
);

create index if not exists story_chunks_chronology on story_evidence_chunks(story_id,source_order desc);
create index if not exists story_chunks_revision on story_evidence_chunks(story_id,source_revision_id);
create index if not exists story_chunks_content on story_evidence_chunks(story_id,content_hash);
-- Exact filtered vector ranking is intentional for V0.1's small per-story pool.
-- No global ANN index: filtering after ANN could lose same-story recall.
alter table story_evidence_chunks enable row level security;
-- Backend connects via its existing server DB role; no client/PostgREST policy.
