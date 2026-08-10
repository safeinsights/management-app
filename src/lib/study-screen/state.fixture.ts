import type { StudyState } from './state.types'

/**
 * Blank-slate StudyState for the resolver tests: a fresh draft with every downstream fact off.
 *
 * The point is that this is the only place in the test tree that spells `StudyState` out as a
 * literal, so adding a field to the type means updating one object here rather than breaking every
 * test file that happened to enumerate it. Tests whose cases share a different starting point layer
 * their own baseline on top (see each test file's local helper) instead of restating the whole shape.
 */
export const studyState = (overrides: Partial<StudyState> = {}): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
    hasStep2Progress: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: false,
    hasSubmittedCode: false,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 0,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'DRAFT',
    latestJobStatuses: [],
    ...overrides,
})
