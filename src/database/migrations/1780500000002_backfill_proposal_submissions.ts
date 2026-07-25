import { type Kysely, sql } from 'kysely'

// OTTER-636: seed one immutable proposal snapshot for every study that has already been submitted
// (submitted_at IS NOT NULL). Version = 1 + number of prior resubmission notes, so an already-resubmitted
// study lands at its latest version. Older versions cannot be reconstructed (historical field bodies were
// overwritten in place before this table existed); only the latest canonical body is captured, and older
// review comments remain as historical feedback. After this runs, reviewer proposal loaders read the
// latest snapshot rather than the mutable study row.
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        INSERT INTO study_proposal_submission
            (study_id, version, submitted_at, submitted_by_user_id, schema_version, snapshot)
        SELECT
            s.id,
            1 + COALESCE((
                SELECT count(*) FROM study_proposal_comment c
                WHERE c.study_id = s.id AND c.entry_type = 'RESUBMISSION-NOTE'
            ), 0),
            COALESCE(s.submitted_at, now()),
            s.researcher_id,
            1,
            jsonb_build_object(
                'title', s.title,
                'piName', s.pi_name,
                'piUserId', s.pi_user_id,
                'language', s.language,
                'datasets', s.datasets,
                'dataSources', s.data_sources,
                'researchQuestions', s.research_questions,
                'projectSummary', s.project_summary,
                'impact', s.impact,
                'additionalNotes', s.additional_notes,
                'irbProtocols', s.irb_protocols,
                'descriptionDocPath', s.description_doc_path,
                'irbDocPath', s.irb_doc_path,
                'agreementDocPath', s.agreement_doc_path
            )
        FROM study s
        WHERE s.submitted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM study_proposal_submission x WHERE x.study_id = s.id)
    `.execute(db)
}

// Data backfill: the inverse is handled by dropping the table (migration 1780500000000 down). A no-op
// here avoids deleting snapshots that later submissions legitimately added.
export async function down(): Promise<void> {}
