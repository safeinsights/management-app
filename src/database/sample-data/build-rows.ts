import type { Insertable } from 'kysely'
import type { DB, StudyJobStatus } from '@/database/types'
import { CODE_DECISION_JOB_STATUSES, ROUND_CLOSING_JOB_STATUSES } from '../../lib/study-job-status'
import {
    AGREEMENT_PDF,
    IMPACTS,
    aiReport,
    approvalNote,
    helperCode,
    helperFileName,
    mainCode,
    mainFileName,
    resultFiles,
    runLog,
    scanLog,
} from './content'
import type { PersonKey } from './extras'
import { fileId, jobId, legalDocumentId, legalVersionId, studyId } from './ids'
import { lexical } from './lexical'
import { agreementPath, codeFilePath, resultsFilePath, type JobPathInfo } from './paths'
import type { SampleRefs } from './refs'
import type { Upload } from './s3'
import type { StudySpec } from './spec'

const HOUR = 3_600_000
const DAY = 24 * HOUR

type Side = 'researcher' | 'reviewer'

// members: the lab's users (researcher side) and the enclave's users (reviewer side).
export type BuildContext = {
    now: Date
    refs: SampleRefs
    people: Record<PersonKey, string>
    members: Record<Side, string[]>
}

export type EncryptedArtifact = {
    fileId: string
    fileType: 'ENCRYPTED-RESULT' | 'ENCRYPTED-CODE-RUN-LOG'
    name: string
    path: string
    jobId: string
    createdAt: Date
    files: { name: string; content: string }[]
    sharedWithLab: boolean
    labActivityAt: Date | null
}

export type StudyRows = {
    study: Insertable<DB['study']> & { id: string }
    agreement: {
        document: Insertable<DB['legalDocument']>
        version: Insertable<DB['legalDocumentVersion']>
        acknowledgements: Insertable<DB['legalDocumentAcknowledgement']>[]
    } | null
    jobs: (Insertable<DB['studyJob']> & { id: string })[]
    statusChanges: Insertable<DB['jobStatusChange']>[]
    files: Insertable<DB['studyJobFile']>[]
    reviews: (Omit<Insertable<DB['studyReview']>, 'report'> & { report: object })[]
    proposalComments: Insertable<DB['studyProposalComment']>[]
    reviewComments: Insertable<DB['studyReviewComment']>[]
    workspaceActivity: Insertable<DB['workspaceFileActivity']>[]
    lastOpened: Insertable<DB['studyLastOpened']>[]
    uploads: Upload[]
    encrypted: EncryptedArtifact[]
}

// Same attribution as tests/e2e.seed.ts: the reviewer decides, the enclave reports run stages
// with no user, and the lab, scanner and packager record the researcher.
const NO_USER_STATUSES: readonly StudyJobStatus[] = [
    'INITIATED',
    'JOB-PROVISIONING',
    'JOB-RUNNING',
    'RUN-COMPLETE',
    'JOB-ERRORED',
]
const REVIEWER_STATUSES: readonly StudyJobStatus[] = [...CODE_DECISION_JOB_STATUSES, ...ROUND_CLOSING_JOB_STATUSES]

const statusActor = (status: StudyJobStatus, refs: SampleRefs) => {
    if (REVIEWER_STATUSES.includes(status)) return refs.reviewerId
    if (NO_USER_STATUSES.includes(status)) return null
    return refs.researcherId
}

const isApproved = (spec: StudySpec) =>
    spec.status === 'APPROVED' || spec.status === 'ARCHIVED' || (spec.status === 'REJECTED' && !!spec.job)

// Fixed offsets from one anchor: the proposal on day 0, its decision on day 1, the job on day 2.
function timeline(spec: StudySpec, now: Date) {
    const created = now.getTime() - spec.daysAgo * DAY
    const statuses = spec.job?.statuses ?? []
    const statusAt = (i: number) => new Date(created + 2 * DAY + (i + 1) * HOUR)
    const atStatus = (status: StudyJobStatus, occurrence = 1) => {
        let seen = 0
        const index = statuses.findIndex((s) => s === status && ++seen === occurrence)
        return index < 0 ? null : statusAt(index)
    }
    return {
        created: new Date(created),
        submitted: new Date(created + 2 * HOUR),
        decided: new Date(created + DAY),
        jobCreated: new Date(created + 2 * DAY),
        statusAt,
        atStatus,
        last: statuses.length ? statusAt(statuses.length - 1) : new Date(created + DAY),
    }
}

function buildStudy(spec: StudySpec, ctx: BuildContext, t: ReturnType<typeof timeline>) {
    const { refs } = ctx
    const approved = isApproved(spec)
    const unassigned = spec.status === 'DRAFT' || spec.status === 'PENDING-REVIEW'
    const hasCode = !!spec.job?.statuses.includes('CODE-SUBMITTED')
    const rejectedAt = spec.status === 'REJECTED' ? (t.atStatus('CODE-REJECTED') ?? t.decided) : null

    return {
        id: studyId(spec.n),
        orgId: refs.enclave.id,
        submittedByOrgId: refs.lab.id,
        researcherId: refs.researcherId,
        reviewerId: unassigned ? null : refs.reviewerId,
        containerLocation: 'sample-data',
        title: spec.title,
        piName: spec.piName,
        piUserId: refs.researcherId,
        status: spec.status,
        language: spec.language,
        dataSources: ['all'],
        datasets: ['Student Activity Logs'],
        outputMimeType: 'application/zip',
        createdAt: t.created,
        lastUpdatedAt: t.last,
        submittedAt: spec.status === 'DRAFT' ? null : t.submitted,
        approvedAt: approved ? t.decided : null,
        rejectedAt,
        researcherAgreementsAckedAt: approved ? new Date(t.decided.getTime() + HOUR) : null,
        reviewerAgreementsAckedAt: approved ? new Date(t.decided.getTime() + HOUR) : null,
        mainCodeFileName: hasCode ? mainFileName(spec) : null,
        researchQuestions: spec.halfFilled ? null : lexical(spec.question),
        projectSummary: lexical(spec.summary),
        impact: spec.halfFilled ? null : lexical(IMPACTS[spec.n % IMPACTS.length]),
        additionalNotes: spec.n % 3 === 0 ? lexical('No students were harmed in the making of this proposal.') : null,
    }
}

function buildProposalComments(spec: StudySpec, ctx: BuildContext, t: ReturnType<typeof timeline>) {
    const notes = [...(spec.proposalNotes ?? [])]
    if (isApproved(spec)) {
        notes.push({ by: 'reviewer', kind: 'feedback', decision: 'APPROVE', version: 1, text: approvalNote(spec.n) })
    }
    return notes.map((note, i) => ({
        studyId: studyId(spec.n),
        authorId: ctx.people[note.by],
        authorRole: note.kind === 'feedback' ? ('REVIEWER' as const) : ('RESEARCHER' as const),
        entryType: note.kind === 'feedback' ? ('REVIEWER-FEEDBACK' as const) : ('RESUBMISSION-NOTE' as const),
        decision: note.decision ?? null,
        body: lexical(note.text),
        version: note.version,
        createdAt: new Date(t.decided.getTime() + i * HOUR),
    }))
}

function buildJob(
    spec: StudySpec,
    ctx: BuildContext,
    t: ReturnType<typeof timeline>,
): Omit<StudyRows, 'study' | 'agreement' | 'proposalComments' | 'lastOpened'> {
    const empty = {
        jobs: [],
        statusChanges: [],
        files: [],
        reviews: [],
        reviewComments: [],
        workspaceActivity: [],
        uploads: [],
        encrypted: [],
    }
    const job = spec.job
    if (!job) return empty

    const { refs, people } = ctx
    const id = jobId(spec.n)
    const info: JobPathInfo = { orgSlug: refs.enclave.slug, studyId: studyId(spec.n), studyJobId: id }
    const rows: Omit<StudyRows, 'study' | 'agreement' | 'proposalComments' | 'lastOpened'> = {
        ...empty,
        jobs: [{ id, studyId: studyId(spec.n), createdAt: t.jobCreated }],
        statusChanges: job.statuses.map((status, i) => ({
            studyJobId: id,
            status,
            userId: statusActor(status, refs),
            createdAt: t.statusAt(i),
        })),
    }

    rows.workspaceActivity.push({
        studyId: studyId(spec.n),
        userId: refs.researcherId,
        fileName: mainFileName(spec),
        action: 'EDITED_IN_IDE',
        createdAt: new Date(t.jobCreated.getTime() + HOUR / 2),
    })

    const submittedAt = t.atStatus('CODE-SUBMITTED')
    if (submittedAt) {
        rows.workspaceActivity.push({
            studyId: studyId(spec.n),
            userId: refs.researcherId,
            fileName: helperFileName(spec),
            action: 'UPLOADED',
            createdAt: new Date(t.jobCreated.getTime() + HOUR / 4),
        })
        const code = [
            { slot: 0, name: mainFileName(spec), body: mainCode(spec), fileType: 'MAIN-CODE' as const },
            { slot: 1, name: helperFileName(spec), body: helperCode(spec), fileType: 'SUPPLEMENTAL-CODE' as const },
        ]
        for (const file of code) {
            const path = codeFilePath(info, file.name)
            rows.files.push({
                id: fileId(spec.n, file.slot),
                studyJobId: id,
                name: file.name,
                path,
                fileType: file.fileType,
                createdAt: submittedAt,
            })
            rows.uploads.push({ path, body: file.body, contentType: 'text/plain' })
        }

        const rounds = job.statuses.filter((s) => s === 'CODE-SUBMITTED').length
        for (let round = 1; round <= rounds; round++) {
            rows.reviews.push({
                studyJobId: id,
                round,
                report: aiReport(spec),
                createdAt: t.atStatus('CODE-SUBMITTED', round)!,
            })
        }
    }

    const scannedAt = t.atStatus('CODE-SCANNED')
    if (scannedAt) {
        const path = resultsFilePath(info, 'security-scan-log.txt')
        rows.files.push({
            id: fileId(spec.n, 2),
            studyJobId: id,
            name: 'security-scan-log.txt',
            path,
            fileType: 'SECURITY-SCAN-LOG',
            createdAt: scannedAt,
        })
        rows.uploads.push({ path, body: scanLog(spec), contentType: 'text/plain' })
    }

    for (const note of job.codeNotes ?? []) {
        const at =
            note.kind === 'resubmission'
                ? t.atStatus('CODE-SUBMITTED', note.round)
                : t.atStatus(note.decision === 'REJECT' ? 'CODE-REJECTED' : 'CODE-CHANGES-REQUESTED', note.round)
        rows.reviewComments.push({
            studyId: studyId(spec.n),
            studyJobId: id,
            authorId: people[note.by],
            reviewKind: 'CODE',
            entryType: note.kind === 'decision' ? 'DECISION' : 'RESUBMISSION-NOTE',
            decision: note.decision ?? null,
            body: lexical(note.text),
            criteria:
                note.kind === 'decision'
                    ? { proposalAlignment: 'no', agreementCompliance: 'yes', privacyProtection: 'no' }
                    : null,
            round: note.round,
            createdAt: at!,
        })
    }

    const codeApprovedAt = t.atStatus('CODE-APPROVED')
    if (codeApprovedAt) {
        rows.reviewComments.push({
            studyId: studyId(spec.n),
            studyJobId: id,
            authorId: refs.reviewerId,
            reviewKind: 'CODE',
            entryType: 'DECISION',
            decision: 'APPROVE',
            body: lexical('Code approved. It does exactly what the proposal says and nothing funnier.'),
            criteria: { proposalAlignment: 'yes', agreementCompliance: 'yes', privacyProtection: 'yes' },
            round: 1,
            createdAt: codeApprovedAt,
        })
    }

    if (job.resultsNote) {
        rows.reviewComments.push({
            studyId: studyId(spec.n),
            studyJobId: id,
            authorId: people[job.resultsNote.by],
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: job.resultsNote.decision,
            body: lexical(job.resultsNote.text),
            criteria: null,
            round: 1,
            createdAt: (t.atStatus('FILES-APPROVED') ?? t.atStatus('FILES-REJECTED'))!,
        })
    }

    if (job.artifact) {
        const isResult = job.artifact === 'result'
        const name = isResult ? 'encrypted-results.zip' : 'encrypted-code-run-log.zip'
        rows.encrypted.push({
            fileId: fileId(spec.n, 3),
            fileType: isResult ? 'ENCRYPTED-RESULT' : 'ENCRYPTED-CODE-RUN-LOG',
            name,
            path: resultsFilePath(info, name),
            jobId: id,
            createdAt: (t.atStatus('RUN-COMPLETE') ?? t.atStatus('JOB-ERRORED'))!,
            files: isResult ? resultFiles(spec) : runLog(spec),
            sharedWithLab: !!job.sharedWithLab,
            labActivityAt: job.labActivity ? t.atStatus('RESULTS-VIEWED') : null,
        })
    }

    return rows
}

function buildAgreement(spec: StudySpec, ctx: BuildContext, t: ReturnType<typeof timeline>) {
    if (!isApproved(spec)) return null
    const document = {
        id: legalDocumentId(spec.n),
        type: 'SLA' as const,
        studyId: studyId(spec.n),
        createdAt: t.decided,
    }
    const version = {
        id: legalVersionId(spec.n),
        legalDocumentId: document.id,
        versionNumber: 1,
        fileName: 'study-agreement.pdf',
        format: 'pdf' as const,
        filePath: agreementPath({ legalDocumentId: document.id, versionId: legalVersionId(spec.n) }),
        publishedAt: t.decided,
        publishedBy: ctx.refs.adminId,
        signedAt: t.decided.toISOString().slice(0, 10),
    }
    const partyUserIds = [...new Set([...ctx.members.researcher, ...ctx.members.reviewer])]
    const acknowledgements = partyUserIds.map((userId) => ({
        legalDocumentVersionId: version.id,
        userId,
        ackedAt: new Date(t.decided.getTime() + HOUR),
    }))
    return { document, version, acknowledgements }
}

export function buildStudyRows(spec: StudySpec, ctx: BuildContext): StudyRows {
    const t = timeline(spec, ctx.now)
    const agreement = buildAgreement(spec, ctx, t)
    const job = buildJob(spec, ctx, t)
    const uploads = agreement
        ? [...job.uploads, { path: agreement.version.filePath, body: AGREEMENT_PDF, contentType: 'application/pdf' }]
        : job.uploads

    return {
        ...job,
        uploads,
        study: buildStudy(spec, ctx, t),
        agreement,
        proposalComments: buildProposalComments(spec, ctx, t),
        lastOpened: buildLastOpened(spec, ctx),
    }
}

// Every member of a side in openedBy has opened the study. A member of both orgs keeps the dot while
// a side that lists the study (the reviewer does not list drafts) has not opened it.
export function buildLastOpened(spec: StudySpec, ctx: BuildContext): Insertable<DB['studyLastOpened']>[] {
    const opened = new Set(spec.openedBy)
    const listing: Side[] = spec.expectedPills.reviewer ? ['researcher', 'reviewer'] : ['researcher']
    const users = new Set(listing.flatMap((side) => ctx.members[side]))
    return [...users]
        .filter((userId) => listing.every((side) => opened.has(side) || !ctx.members[side].includes(userId)))
        .map((userId) => ({ studyId: studyId(spec.n), userId, openedAt: ctx.now }))
}
