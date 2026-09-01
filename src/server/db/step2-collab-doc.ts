import { sql } from 'kysely'
import {
    PROPOSAL_FIELDS_SUFFIX,
    PROPOSAL_PREFIX,
    PROPOSAL_TEXT_SLUGS,
    proposalTextFieldSuffix,
} from '@/lib/collaboration-documents'

// Step 2 persists into Yjs, not the study columns, so an unflushed draft looks empty (OTTER-572).
// Suffixes come from collaboration-documents.ts so the spellings cannot drift.
const STEP2_DOC_SUFFIXES = [PROPOSAL_FIELDS_SUFFIX, ...PROPOSAL_TEXT_SLUGS.map(proposalTextFieldSuffix)]

const docNameForStudyRow = (suffix: string) => sql`${PROPOSAL_PREFIX} || "study"."id"::text || ${suffix}`

// Both conjuncts are deliberate: study_id fails closed if the naming convention drifts, and name is
// the primary-key fast path. Exact equality, never `like`: a per-row pattern cannot drive a range
// scan. Requires the enclosing query to expose the studies table unaliased as `study`.
export const hasStep2CollabDocSql = sql<boolean>`exists (
    select 1
      from "yjs_document"
     where "yjs_document"."study_id" = "study"."id"
       and "yjs_document"."name" = any(array[${sql.join(STEP2_DOC_SUFFIXES.map(docNameForStudyRow))}])
)`
