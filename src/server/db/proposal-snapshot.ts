import { sql } from 'kysely'
import { db as defaultDb, type DBExecutor } from '@/database'
import type { Json } from '@/database/types'
import { parseProposalSnapshot, serializeProposalSnapshot, type ProposalSnapshot } from '@/lib/proposal-snapshot'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-636: capture an immutable snapshot of a study's current canonical proposal columns as the next
// submission version. Called inside the submission transaction by both the fresh-submit (finalize) and
// resubmit paths, so every submission produces exactly one immutable version and reviewers always have a
// safe source to read. Version = max(existing) + 1 (so a fresh submit is v1, each resubmit the next).
export async function writeProposalSubmissionSnapshot(
    db: DBExecutor,
    studyId: string,
    submittedByUserId: string,
): Promise<number> {
    const study = await db
        .selectFrom('study')
        .select([
            'title',
            'piName',
            'piUserId',
            'language',
            'datasets',
            'dataSources',
            'researchQuestions',
            'projectSummary',
            'impact',
            'additionalNotes',
            'irbProtocols',
            'descriptionDocPath',
            'irbDocPath',
            'agreementDocPath',
        ])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()

    const maxRow = await db
        .selectFrom('studyProposalSubmission')
        .select((eb) => eb.fn.max('version').as('max'))
        .where('studyId', '=', studyId)
        .executeTakeFirst()
    const version = Number(maxRow?.max ?? 0) + 1

    await db
        .insertInto('studyProposalSubmission')
        .values({
            studyId,
            version,
            submittedByUserId,
            snapshot: serializeProposalSnapshot(study) as unknown as Json,
        })
        .execute()
    return version
}

export type LatestProposalSnapshot = {
    version: number
    snapshot: ProposalSnapshot
    // Resolved from the snapshot's frozen dataset ids (not the mutable study row), so a reviewer sees
    // the datasets as they were submitted even while the researcher revises.
    orgDataSources: { id: string; name: string }[]
}

// OTTER-636: the immutable proposal content a reviewer (and the read-only submitted views) must render
// instead of the mutable `study` row / live Yjs. Returns null for a study that has never been submitted
// (a fresh draft), whose only source is the mutable row it owns.
export async function latestProposalSnapshotForStudy(
    studyId: string,
    db: DBExecutor = defaultDb,
): Promise<LatestProposalSnapshot | null> {
    const row = await db
        .selectFrom('studyProposalSubmission')
        .select(['version', 'snapshot'])
        .where('studyId', '=', studyId)
        .orderBy('version', 'desc')
        .limit(1)
        .executeTakeFirst()
    if (!row) return null

    const snapshot = parseProposalSnapshot(row.snapshot)
    const datasets = snapshot.datasets ?? []
    // Compare on id::text (mirrors fetchStudyQuery), not `id IN (...)`. `orgDataSource.id` is a uuid, and
    // datasets can hold non-uuid values (legacy rows, e2e seeds); a raw uuid `IN` would make Postgres
    // throw "invalid input syntax for type uuid" and 500 every reviewer/submitted page for that study.
    const orgDataSources = datasets.length
        ? await db
              .selectFrom('orgDataSource')
              .select(['id', 'name'])
              .where(sql<boolean>`"org_data_source"."id"::text = ANY(${datasets})`)
              .execute()
        : []
    return { version: row.version, snapshot, orgDataSources }
}

// OTTER-636: overlay the latest immutable submitted-proposal snapshot onto a fetched study for any
// read-only proposal surface (reviewer /review, researcher /view, /submitted). Reviewers and read-only
// researcher views must show the last submitted proposal, never the mutable study row / live revision
// draft. A study with no snapshot yet (a fresh, never-submitted draft) is returned unchanged — its own
// mutable row is the only source and it belongs to the researcher.
export async function overlaidWithLatestProposalSnapshot(
    studyId: string,
    study: SelectedStudy,
    db: DBExecutor = defaultDb,
): Promise<SelectedStudy> {
    const latest = await latestProposalSnapshotForStudy(studyId, db)
    if (!latest) return study
    // OTTER-636: a revision draft renders as its last submitted version, which was change-requested (the
    // only decision that produces a revision draft). Present that effective status so read-only feedback
    // / submitted views treat it as a submitted proposal rather than a fresh draft; the base id is left
    // on the object so those views can still show a "being revised" notice.
    const isRevisionDraft = study.status === 'DRAFT' && study.proposalRevisionBaseSubmissionId != null
    return {
        ...study,
        status: isRevisionDraft ? 'CHANGE-REQUESTED' : study.status,
        title: latest.snapshot.title,
        piName: latest.snapshot.piName,
        piUserId: latest.snapshot.piUserId,
        language: latest.snapshot.language,
        datasets: latest.snapshot.datasets,
        dataSources: latest.snapshot.dataSources,
        researchQuestions: latest.snapshot.researchQuestions as SelectedStudy['researchQuestions'],
        projectSummary: latest.snapshot.projectSummary as SelectedStudy['projectSummary'],
        impact: latest.snapshot.impact as SelectedStudy['impact'],
        additionalNotes: latest.snapshot.additionalNotes as SelectedStudy['additionalNotes'],
        irbProtocols: latest.snapshot.irbProtocols,
        descriptionDocPath: latest.snapshot.descriptionDocPath,
        irbDocPath: latest.snapshot.irbDocPath,
        agreementDocPath: latest.snapshot.agreementDocPath,
        orgDataSources: latest.orgDataSources,
    }
}
