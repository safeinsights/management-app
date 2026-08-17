import { sql } from 'kysely'
import {
    PROPOSAL_FIELDS_SUFFIX,
    PROPOSAL_PREFIX,
    PROPOSAL_TEXT_SLUGS,
    proposalTextFieldSuffix,
} from '@/lib/collaboration-documents'

// Step 2 of the proposal wizard persists into Yjs, not into the study columns: every edit goes to the
// `proposal-<studyId>-fields` document or to one per lexical field, and the columns are written only by
// Previous / View as reviewer / Submit. A draft edited on Step 2 and left by any other exit (nav link,
// closed tab, back button) therefore has empty Step 2 columns, which used to send the researcher back to
// the Step 1 picker on reopen (OTTER-572).
//
// Every document name Step 2 can write for a study. The fields document alone would very nearly do, since
// it is created the first time Step 2 mounts (use-yjs-form-map seeds title/datasets/piName/piUserId into a
// document that does not exist yet), but listing the lexical documents too keeps the signal correct if that
// seeding ever changes. Both suffixes come from collaboration-documents.ts, the source of truth that
// proposalFieldsDocName / proposalTextFieldDocName also build from, so the two spellings cannot drift.
const STEP2_DOC_SUFFIXES = [PROPOSAL_FIELDS_SUFFIX, ...PROPOSAL_TEXT_SLUGS.map(proposalTextFieldSuffix)]

const docNameForStudyRow = (suffix: string) => sql`${PROPOSAL_PREFIX} || "study"."id"::text || ${suffix}`

// Correlated to the outer row twice over, and both conjuncts are deliberate. `study_id` is the explicit
// correlation, so the subquery reads as scoped to one study and fails closed if the naming convention ever
// drifts from what proposalFieldsDocName builds. `name` is the fast path: it is yjs_document's primary key,
// so each probe is an index lookup while `study_id` carries only an FK and no index.
//
// Exact name equality, never `name like 'proposal-' || id || '-%'`: a pattern built per outer row is not a
// planner-time constant, so it could not drive a prefix range scan (and a non-C collation would need
// text_pattern_ops anyway), whereas equality against the outer row resolves through that primary key.
//
// Requires the enclosing query to expose the studies table as `study` (both callers select from it
// unaliased).
export const hasStep2CollabDocSql = sql<boolean>`exists (
    select 1
      from "yjs_document"
     where "yjs_document"."study_id" = "study"."id"
       and "yjs_document"."name" = any(array[${sql.join(STEP2_DOC_SUFFIXES.map(docNameForStudyRow))}])
)`
