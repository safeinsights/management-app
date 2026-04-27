import { AllStatus } from '@/lib/types'

export type PillColors = {
    bg: string
    c: string
}

export type StatusLabel = {
    stage: 'Proposal' | 'Code' | 'Results'
    label: string
    tooltip?: string
    colors: PillColors
}

const COLORS = {
    draft: { bg: 'grey.10', c: 'gray.9' },
    needsReview: { bg: 'purple.1', c: 'purple.7' },
    underReview: { bg: 'yellow.0', c: 'dark.9' },
    rejected: { bg: 'red.1', c: 'red.8' },
    approved: { bg: 'green.1', c: 'green.8' },
    clarification: { bg: 'blue.1', c: 'blue.8' },
    default: { bg: 'gray.1', c: 'dark.5' },
}

// ORDER MATTERS in the below lists
// The LAST status found will be displayed
// EXCEPT for 'JOB-ERRORED' which takes precedence over all other statuses if it exists,
// with one caveat: for researchers, JOB-ERRORED is hidden until the reviewer posts a
// FILES-APPROVED/FILES-REJECTED decision on the error logs (see useStudyStatus).

// Proposal -> Code -> Results
export const REVIEWER_STATUS_LABELS: Partial<Record<AllStatus, StatusLabel>> = {
    // note: there is no 'DRAFT' label here even though that status exists on studies
    // BECAUSE a reviewer should never see a DRAFT study

    // Proposal
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Needs Review',
        tooltip: 'This proposal is now ready for review. Open the study for more details.',
        colors: COLORS.needsReview,
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            "This study proposal has been approved. It's now on the Researcher to submit their code for review. You'll receive an email once it's ready.",
        colors: COLORS.approved,
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip:
            "This study proposal has been rejected. It's now on the Researcher to revise and submit an updated version of their proposal. You'll receive an email once it's ready.",
        colors: COLORS.rejected,
    },
    'CHANGE-REQUESTED': {
        stage: 'Proposal',
        label: 'Proposal change requested',
        tooltip: "You've asked the Researcher to clarify or revise this proposal.",
        colors: COLORS.clarification,
    },

    // Code
    'CODE-SUBMITTED': {
        stage: 'Code',
        label: 'Needs Review',
        tooltip: 'This study code is now ready for review. Open the study for more details.',
        colors: COLORS.needsReview,
    },
    'CODE-SCANNED': {
        stage: 'Code',
        label: 'Needs Review',
        tooltip: 'This study code is now ready for review. Open the study for more details.',
        colors: COLORS.needsReview,
    },
    'CODE-APPROVED': {
        stage: 'Code',
        label: 'Approved',
        tooltip:
            'This study code has been approved and is now being prepared to run in the enclave. No further action is needed at this time.',
        colors: COLORS.approved,
    },
    'CODE-REJECTED': {
        stage: 'Code',
        label: 'Rejected',
        tooltip:
            "This study code has been rejected. It's now on the Researcher to revise and submit an updated version of their code. You'll receive an email once it's ready.",
        colors: COLORS.rejected,
    },
    'JOB-PACKAGING': {
        stage: 'Code',
        label: 'Packaging',
        tooltip: 'Preparing code to run in enclave. If it stays in this status for over 1h, contact SI admins.',
        colors: COLORS.default,
    },
    'JOB-READY': {
        stage: 'Code',
        label: 'Ready',
        tooltip:
            'The code is packaged and ready to be picked up by the enclave. If it stays in this status for over 1h, contact your Org Admin.',
        colors: COLORS.approved,
    },
    'JOB-RUNNING': {
        stage: 'Code',
        label: 'Processing',
        tooltip:
            "The code is now running against the enclave. You'll receive an email once results are ready for review.",
        colors: COLORS.default,
    },
    'JOB-ERRORED': {
        stage: 'Code',
        label: 'Errored',
        tooltip: 'The code ran into an error. Open the study for more details.',
        colors: COLORS.rejected,
    },

    // Results
    'RUN-COMPLETE': {
        stage: 'Results',
        label: 'Needs Review',
        tooltip: 'Study results are now ready for review. Open the study for more details.',
        colors: COLORS.underReview,
    },
    'FILES-APPROVED': {
        stage: 'Results',
        label: 'Ready',
        tooltip: 'Approved! Study results have now been shared with the Researcher.',
        colors: COLORS.approved,
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'Sharing of results was rejected. The research lab now needs to revise and submit an updated version.',
        colors: COLORS.rejected,
    },
}

// Proposal -> Code -> Results
export const RESEARCHER_STATUS_LABELS: Partial<Record<AllStatus, StatusLabel>> = {
    // Proposal
    DRAFT: {
        stage: 'Proposal',
        label: 'Draft',
        colors: COLORS.draft,
    },
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Under Review',
        tooltip: "Your study proposal is being reviewed. You'll receive an email once a decision is made.",
        colors: COLORS.underReview,
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip: 'Your study proposal has been approved! Open your study to submit your code.',
        colors: COLORS.approved,
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: 'Your study proposal needs revision. Open your study for more details.',
        colors: COLORS.rejected,
    },
    'CHANGE-REQUESTED': {
        stage: 'Proposal',
        label: 'Proposal change requested',
        tooltip: 'The reviewer has requested changes to your proposal. Open your study for more details.',
        colors: COLORS.underReview,
    },

    // Code
    INITIATED: {
        stage: 'Code',
        label: 'Draft',
        colors: COLORS.draft,
    },
    'CODE-SUBMITTED': {
        stage: 'Code',
        label: 'Under Review',
        tooltip: "Your study code is being reviewed. You'll receive an email once a decision is made.",
        colors: COLORS.underReview,
    },
    'CODE-SCANNED': {
        stage: 'Code',
        label: 'Under Review',
        tooltip: "Your study code is being reviewed. You'll receive an email once a decision is made.",
        colors: COLORS.underReview,
    },
    'CODE-APPROVED': {
        stage: 'Code',
        label: 'Approved',
        tooltip:
            "Your study code has been approved and is now being executed! You'll receive an email once results are ready.",
        colors: COLORS.approved,
    },
    'CODE-REJECTED': {
        stage: 'Code',
        label: 'Rejected',
        tooltip: 'Your study code needs revision. Open your study for more details.',
        colors: COLORS.rejected,
    },
    'JOB-ERRORED': {
        stage: 'Code',
        label: 'Errored',
        tooltip: 'Your study code needs revision. Open your study for more details.',
        colors: COLORS.rejected,
    },

    // Results
    'RUN-COMPLETE': {
        stage: 'Results',
        label: 'Under Review',
        tooltip:
            "Your code ran successfully! The results are now under review. You'll receive an email once a decision is made.",
        colors: COLORS.underReview,
    },
    'FILES-APPROVED': {
        stage: 'Results',
        label: 'Ready',
        tooltip: 'The results of your analysis have been approved! Open your study to access them.',
        colors: COLORS.approved,
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'The results of your analysis have not been approved. Open your study for more details.',
        colors: COLORS.rejected,
    },
}
