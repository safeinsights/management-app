import type { Language, ReviewDecision, StudyJobStatus, StudyStatus } from '@/database/types'
import type { PillId } from '@/lib/status-labels'
import type { PersonKey } from './extras'

export type ProposalNote = {
    by: PersonKey
    kind: 'feedback' | 'resubmission'
    decision?: ReviewDecision
    text: string
    version: number
}
export type CodeNote = {
    by: PersonKey
    kind: 'decision' | 'resubmission'
    decision?: ReviewDecision
    text: string
    round: number
}
export type ResultsNote = { by: PersonKey; decision: 'APPROVE' | 'REJECT'; text: string }

export type JobSpec = {
    // oldest first; the app reads them as a set
    statuses: StudyJobStatus[]
    codeNotes?: CodeNote[]
    resultsNote?: ResultsNote
    artifact?: 'result' | 'error-log'
    // FILES-APPROVED: wrap the result keys for the lab, as a reviewer's share does
    sharedWithLab?: boolean
    // VIEWED and DOWNLOADED rows on the result, by the researcher
    labActivity?: boolean
}

export type StudySpec = {
    n: number
    title: string
    piName: string
    language: Language
    status: StudyStatus
    daysAgo: number
    question: string
    summary: string
    // DRAFT only: leaves research questions and impact empty
    halfFilled?: boolean
    proposalNotes?: ProposalNote[]
    job?: JobSpec
    openedBy?: ('researcher' | 'reviewer')[]
    // reviewer null: the reviewer dashboard does not list the study (DRAFT)
    expectedPills: { researcher: PillId; reviewer: PillId | null }
}
