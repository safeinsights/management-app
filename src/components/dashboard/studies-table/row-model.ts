import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { UNTITLED_STUDY_TITLE } from '@/lib/string'
import type { StatusLabel } from '@/lib/status-labels'
import { resolveDashboardAction, resolvePillStatus, resolveRowHighlight, type StudyState } from '@/lib/study-screen'
import { lastBadgeChangeAt, rowStudyState } from './dashboard-raw-state'
import { dataPartnerDisplayName, labDisplayName, pillOrgNamesFromRow } from './pill-context'
import type { Audience, StudyRow } from './types'

export const NOT_SUBMITTED = 'Not submitted'
export const NOT_REVIEWED = 'Not reviewed'

export type Attribution = {
    // null renders the stage placeholder (`Not submitted` / `Not reviewed`).
    name: string | null
    lines: string[]
}

export type RowModel = {
    id: string
    title: string
    href: Route
    lastActivityAt: Date
    submittedTo: string | null
    submittedFrom: string | null
    belongsTo: string | null
    submittedBy: Attribution
    reviewedBy: Attribution
    status: StatusLabel
    isHighlighted: boolean
    canDeleteDraft: boolean
    study: StudyRow
}

type Stage = { name: string | null | undefined; at: Date | string | null | undefined }

const timeOf = (at: Date | string | null | undefined) => (at ? new Date(at).getTime() : null)

const newestStage = (stages: Stage[]): Stage | null =>
    stages.reduce<Stage | null>((newest, stage) => {
        const at = timeOf(stage.at)
        if (!stage.name || at === null) return newest
        return newest && (timeOf(newest.at) ?? 0) >= at ? newest : stage
    }, null)

// The finalize audit row and resubmission notes are the only record of who submitted the proposal;
// a submitted study with neither falls back to its creator.
const proposalSubmission = (study: StudyRow): Stage => {
    const recorded = newestStage([
        { name: study.proposalAuditName, at: study.proposalAuditAt },
        { name: study.proposalResubmitterName, at: study.proposalResubmittedAt },
    ])
    if (recorded) return recorded
    if (study.status === 'DRAFT') return { name: null, at: null }
    return { name: study.createdBy, at: study.submittedAt ?? study.createdAt }
}

// Proposal decisions made before REVIEWER-FEEDBACK rows existed left only study.reviewer_id, and every
// later code or outputs decision overwrites it, so it names the proposal reviewer only when neither exists.
const proposalReview = (study: StudyRow): Stage => {
    if (study.proposalReviewerName) return { name: study.proposalReviewerName, at: study.proposalReviewedAt }
    const decidedAt = study.approvedAt ?? study.rejectedAt
    if (!decidedAt || study.codeReviewerName || study.outputsReviewerName) return { name: null, at: null }
    return { name: study.reviewerName, at: decidedAt }
}

const attribution = (stages: Array<[label: string, stage: Stage]>, placeholder: string): Attribution => ({
    name: newestStage(stages.map(([, stage]) => stage))?.name ?? null,
    lines: stages.map(([label, stage]) => `${label}: ${stage.name ?? placeholder}`),
})

const newestDate = (...dates: Array<Date | string | null | undefined>): Date =>
    new Date(Math.max(...dates.map((date) => timeOf(date) ?? 0)))

// The researcher link and the draft bin come from the same dashboard rule (docs/study-screens-logic.md,
// Stage 3); the label it also returns is no longer rendered.
const rowLink = (study: StudyRow, state: StudyState, audience: Audience, orgSlug: string, userId?: string) => {
    if (audience === 'reviewer') {
        return {
            href: Routes.studyReview({ orgSlug: study.orgSlug || orgSlug, studyId: study.id }),
            canDeleteDraft: false,
        }
    }
    const action = resolveDashboardAction('researcher', state, {
        orgSlug: study.submittedByOrgSlug || orgSlug,
        studyId: study.id,
    })
    return {
        href: action.href,
        canDeleteDraft: action.secondaryAction === 'delete-draft' && !!userId && userId === study.researcherId,
    }
}

// One projection per row, so the sort key, the rendered cell and the title link cannot disagree.
export function buildRowModel(
    study: StudyRow,
    audience: Audience,
    { orgSlug, userId }: { orgSlug: string; userId?: string },
): RowModel {
    const state = rowStudyState(study)
    const { href, canDeleteDraft } = rowLink(study, state, audience, orgSlug, userId)
    return {
        id: study.id,
        title: study.title?.trim() || UNTITLED_STUDY_TITLE,
        href,
        lastActivityAt: newestDate(study.lastUpdatedAt, lastBadgeChangeAt(study, audience), study.ownEditsAt),
        submittedTo: study.status === 'DRAFT' ? null : dataPartnerDisplayName(study),
        submittedFrom: labDisplayName(study),
        belongsTo: audience === 'researcher' ? labDisplayName(study) : dataPartnerDisplayName(study),
        submittedBy: attribution(
            [
                ['Proposal', proposalSubmission(study)],
                ['Code', { name: study.codeSubmitterName, at: study.codeSubmittedAt }],
            ],
            NOT_SUBMITTED,
        ),
        reviewedBy: attribution(
            [
                ['Proposal', proposalReview(study)],
                ['Code', { name: study.codeReviewerName, at: study.codeReviewedAt }],
                ['Outputs', { name: study.outputsReviewerName, at: study.outputsReviewedAt }],
            ],
            NOT_REVIEWED,
        ),
        status: resolvePillStatus(audience, state, pillOrgNamesFromRow(study)),
        isHighlighted: resolveRowHighlight(audience, state),
        canDeleteDraft,
        study,
    }
}
