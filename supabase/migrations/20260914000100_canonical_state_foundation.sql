-- Story-scoped, typed current state. Version snapshots are audit artifacts, not current state.
create table stories (
  id uuid primary key, title text not null check (length(trim(title)) > 0),
  current_version integer not null default 0 check (current_version >= 0),
  current_chapter integer check (current_chapter >= 0),
  story_revision integer not null default 0 check (story_revision >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table source_documents (
  story_id uuid not null references stories(id), id uuid not null, title text not null,
  source_order integer not null check (source_order >= 0), chapter integer check (chapter >= 0),
  created_at timestamptz not null default now(), primary key (story_id,id), unique (story_id,source_order)
);
create table source_revisions (
  story_id uuid not null, id uuid not null, document_id uuid not null,
  revision_number integer not null check (revision_number > 0), content text not null,
  visibility text not null check (visibility in ('canonical','author_only')),
  created_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,document_id) references source_documents(story_id,id),
  unique (story_id,document_id,revision_number)
);

create table characters (
  story_id uuid not null references stories(id), id uuid not null, name text not null, role text not null,
  location_value text, location_status text not null check (location_status in ('resolved','unresolved')),
  last_confirmed_location text, active boolean not null default true,
  updated_at timestamptz not null default now(), primary key (story_id,id),
  check ((location_status = 'resolved' and location_value is not null and location_value = last_confirmed_location)
    or (location_status = 'unresolved' and location_value is null)),
  check (lower(coalesce(location_value,'')) not in ('unknown','unresolved')),
  check (lower(coalesce(last_confirmed_location,'')) not in ('unknown','unresolved'))
);
create table evidence (
  story_id uuid not null, id uuid not null, source_revision_id uuid not null,
  quote text not null, start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset), speaker_id uuid,
  created_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,source_revision_id) references source_revisions(story_id,id),
  foreign key (story_id,speaker_id) references characters(story_id,id)
);
create table items (
  story_id uuid not null references stories(id), id uuid not null, name text not null,
  owner_value uuid, owner_status text not null check (owner_status in ('resolved','unresolved')),
  owner_last_confirmed uuid, holder_value uuid, holder_status text not null check (holder_status in ('resolved','unresolved')),
  holder_last_confirmed uuid,
  custodian_value uuid, custodian_status text check (custodian_status in ('resolved','unresolved')),
  custodian_last_confirmed uuid,
  condition text not null check (length(condition) between 1 and 120 and condition = btrim(condition) and lower(condition) not in ('unknown','unresolved')),
  active boolean not null default true, updated_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,owner_value) references characters(story_id,id),
  foreign key (story_id,owner_last_confirmed) references characters(story_id,id),
  foreign key (story_id,holder_value) references characters(story_id,id),
  foreign key (story_id,holder_last_confirmed) references characters(story_id,id),
  foreign key (story_id,custodian_value) references characters(story_id,id),
  foreign key (story_id,custodian_last_confirmed) references characters(story_id,id),
  check ((owner_status = 'resolved' and owner_value is not null and owner_value = owner_last_confirmed) or (owner_status = 'unresolved' and owner_value is null)),
  check ((holder_status = 'resolved' and holder_value is not null and holder_value = holder_last_confirmed) or (holder_status = 'unresolved' and holder_value is null)),
  check (case
    when custodian_status is null then custodian_value is null and custodian_last_confirmed is null
    when custodian_status = 'resolved' then custodian_value is not null and custodian_last_confirmed is not null and custodian_value = custodian_last_confirmed
    when custodian_status = 'unresolved' then custodian_value is null
    else false end)
);
create table plot_threads (
  story_id uuid not null references stories(id), id uuid not null, title text not null, core_question text not null,
  status text not null check (status in ('open','progressing','resolved')), resolution text,
  active boolean not null default true, updated_at timestamptz not null default now(), primary key (story_id,id),
  check ((status = 'resolved') = (resolution is not null))
);
create table propositions (
  story_id uuid not null references stories(id), id uuid not null, statement text not null,
  kind text not null check (kind in ('assertion','reported')),
  reported_proposition_id uuid, reporter_id uuid, active boolean not null default true,
  updated_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,reported_proposition_id) references propositions(story_id,id) deferrable initially deferred,
  foreign key (story_id,reporter_id) references characters(story_id,id),
  check ((kind = 'reported' and reported_proposition_id is not null and reporter_id is not null and reported_proposition_id <> id)
    or (kind = 'assertion' and reported_proposition_id is null and reporter_id is null))
);
create table world_truth_states (
  story_id uuid not null references stories(id), id uuid not null, proposition_id uuid not null,
  status text not null check (status in ('confirmed_true','confirmed_false','unresolved')),
  active boolean not null default true, updated_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,proposition_id) references propositions(story_id,id)
);
create unique index world_truth_one_active on world_truth_states(story_id,proposition_id) where active;
create table character_knowledge_states (
  story_id uuid not null references stories(id), id uuid not null,
  character_id uuid not null, proposition_id uuid not null,
  stance text not null check (stance in ('unaware','suspects','believes','knows')),
  believed_value boolean, basis jsonb not null check (jsonb_typeof(basis) = 'object'),
  active boolean not null default true, updated_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,character_id) references characters(story_id,id),
  foreign key (story_id,proposition_id) references propositions(story_id,id),
  check ((stance = 'unaware' and believed_value is null) or (stance = 'suspects') or (stance in ('believes','knows') and believed_value is not null))
);
create unique index knowledge_one_active on character_knowledge_states(story_id,character_id,proposition_id) where active;
create table relationships (
  story_id uuid not null references stories(id), id uuid not null,
  from_character_id uuid not null, to_character_id uuid not null,
  category text not null check (category in ('structural','explicit_operational','human_confirmed_psychological')),
  predicate text not null, value text not null, scope text not null,
  basis jsonb not null check (jsonb_typeof(basis) = 'object'), active boolean not null default true,
  updated_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,from_character_id) references characters(story_id,id),
  foreign key (story_id,to_character_id) references characters(story_id,id),
  check (from_character_id <> to_character_id)
);
create unique index relationship_one_active on relationships(story_id,from_character_id,to_character_id,category,predicate,scope) where active;

create table events (
  story_id uuid not null references stories(id), id uuid not null,
  source_revision_id uuid not null, source_order integer not null check (source_order >= 0),
  story_time text, event_type text not null, summary text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(), primary key (story_id,id),
  foreign key (story_id,source_revision_id) references source_revisions(story_id,id)
);
create index events_story_order on events(story_id,source_order,created_at);
create table event_participants (
  story_id uuid not null, event_id uuid not null, character_id uuid not null,
  primary key (story_id,event_id,character_id),
  foreign key (story_id,event_id) references events(story_id,id),
  foreign key (story_id,character_id) references characters(story_id,id)
);
create table event_evidence (
  story_id uuid not null, event_id uuid not null, evidence_id uuid not null,
  primary key (story_id,event_id,evidence_id),
  foreign key (story_id,event_id) references events(story_id,id),
  foreign key (story_id,evidence_id) references evidence(story_id,id)
);
create table state_versions (
  story_id uuid not null references stories(id), id uuid not null,
  version_number integer not null check (version_number > 0), parent_version_id uuid,
  commit_kind text not null check (commit_kind in ('delta_commit','restore')),
  chapter integer check (chapter >= 0), story_revision integer not null check (story_revision >= 0),
  restored_from_version_id uuid, snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(), primary key (story_id,id), unique (story_id,version_number),
  foreign key (story_id,parent_version_id) references state_versions(story_id,id),
  foreign key (story_id,restored_from_version_id) references state_versions(story_id,id),
  check ((commit_kind = 'restore') = (restored_from_version_id is not null))
);
create index versions_story_newest on state_versions(story_id,version_number desc);
create table state_deltas (
  story_id uuid not null references stories(id), id uuid not null,
  operation text not null check (operation in ('CREATE','UPDATE','CLOSE','RESOLVE','INVALIDATE','NO_CHANGE')),
  target_type text not null check (target_type in ('characters','items','plotThreads','propositions','worldTruth','knowledge','relationships')),
  target_id uuid not null, field_path text not null, before_value jsonb, after_value jsonb,
  source_kind text not null check (source_kind in ('story_event','human_correction','canonical_override','retcon','import_migration','restore')),
  source_event_id uuid, effect_id uuid, effect_description text,
  reason text not null, confidence numeric(4,3) not null check (confidence between 0 and 1),
  risk jsonb not null check (jsonb_typeof(risk) = 'array'), proposed_by text not null,
  basis jsonb not null check (jsonb_typeof(basis) = 'object'), resolution_support jsonb,
  decision text not null check (decision in ('accepted','rejected','needs_review','deferred')),
  validator_result jsonb, committed_version_id uuid, created_at timestamptz not null default now(),
  primary key (story_id,id),
  foreign key (story_id,source_event_id) references events(story_id,id),
  foreign key (story_id,committed_version_id) references state_versions(story_id,id) deferrable initially deferred,
  check ((source_kind = 'story_event') = (source_event_id is not null and effect_id is not null and effect_description is not null)),
  check (committed_version_id is null or decision = 'accepted'),
  check (operation <> 'NO_CHANGE' or before_value is not distinct from after_value)
);
create index deltas_story_decision on state_deltas(story_id,decision,committed_version_id);
create index deltas_story_target on state_deltas(story_id,target_type,target_id);
create index deltas_source_event on state_deltas(story_id,source_event_id) where source_event_id is not null;
create table delta_evidence (
  story_id uuid not null, delta_id uuid not null, evidence_id uuid not null,
  primary key (story_id,delta_id,evidence_id),
  foreign key (story_id,delta_id) references state_deltas(story_id,id),
  foreign key (story_id,evidence_id) references evidence(story_id,id)
);
create table delta_decisions (
  story_id uuid not null, id bigint generated always as identity primary key, delta_id uuid not null,
  decision text not null check (decision in ('accepted','rejected','needs_review','deferred')),
  actor text not null, reason text not null, created_at timestamptz not null default now(),
  foreign key (story_id,delta_id) references state_deltas(story_id,id)
);
create index delta_decisions_by_delta on delta_decisions(story_id,delta_id,id);
create table derived_annotations (
  story_id uuid not null references stories(id), id uuid not null,
  source_revision_id uuid not null, target_type text not null check (target_type in ('characters','items','plotThreads','propositions','worldTruth','knowledge','relationships')),
  target_id uuid not null, content text not null, confidence numeric(4,3) not null check (confidence between 0 and 1),
  basis jsonb not null check (jsonb_typeof(basis) = 'object'), scope jsonb not null default '{}'::jsonb,
  invalidated_at timestamptz, superseded_by uuid, created_at timestamptz not null default now(),
  primary key (story_id,id),
  foreign key (story_id,source_revision_id) references source_revisions(story_id,id),
  foreign key (story_id,superseded_by) references derived_annotations(story_id,id)
);
create table annotation_evidence (
  story_id uuid not null, annotation_id uuid not null, evidence_id uuid not null,
  primary key (story_id,annotation_id,evidence_id),
  foreign key (story_id,annotation_id) references derived_annotations(story_id,id),
  foreign key (story_id,evidence_id) references evidence(story_id,id)
);

-- Ledger and version records are immutable even if a caller bypasses the service.
create function storystate_immutable() returns trigger language plpgsql as $$
begin raise exception 'append-only StoryState record'; end $$;
create trigger events_immutable before update or delete on events for each row execute function storystate_immutable();
create trigger versions_immutable before update or delete on state_versions for each row execute function storystate_immutable();
create trigger decisions_immutable before update or delete on delta_decisions for each row execute function storystate_immutable();
create trigger revisions_immutable before update or delete on source_revisions for each row execute function storystate_immutable();
create trigger documents_immutable before update or delete on source_documents for each row execute function storystate_immutable();
create trigger evidence_immutable before update or delete on evidence for each row execute function storystate_immutable();
create trigger participants_immutable before update or delete on event_participants for each row execute function storystate_immutable();
create trigger event_evidence_immutable before update or delete on event_evidence for each row execute function storystate_immutable();
create trigger delta_evidence_immutable before update or delete on delta_evidence for each row execute function storystate_immutable();
create trigger annotation_evidence_immutable before update or delete on annotation_evidence for each row execute function storystate_immutable();

create function storystate_delta_audit_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append-only State Delta'; end if;
  if (to_jsonb(new) - 'decision' - 'validator_result' - 'committed_version_id')
     is distinct from (to_jsonb(old) - 'decision' - 'validator_result' - 'committed_version_id')
  then raise exception 'State Delta provenance is immutable'; end if;
  if old.committed_version_id is not null then raise exception 'committed State Delta is immutable'; end if;
  return new;
end $$;
create trigger delta_audit_guard before update or delete on state_deltas for each row execute function storystate_delta_audit_guard();
