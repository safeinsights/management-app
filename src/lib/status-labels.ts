import { AllStatus } from '@/lib/types'

export type StatusLabel = {
    stage: 'Proposal' | 'Code' | 'Results'
    label: string
    tooltip?: string
}

// ORDER MATTERS in the below lists
// The LAST status found will be displayed
// EXCEPT for 'JOB-ERRORED' which takes precedence over all other statuses if it exists

// Proposal -> Code -> Results
export const REVIEWER_STATUS_LABELS: Partial<Record<AllStatus, StatusLabel>> = {
    // Proposal
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Needs Review',
        tooltip: 'This proposal is now ready for review. Open the study for more details.',
    },
    'CODE-SUBMITTED': {
        stage: 'Proposal',
        label: 'Needs Review',
        tooltip: 'This proposal is now ready for review. Open the study for more details.',
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            'Approved! The code is now being prepared to run in the enclave. No further action is needed at this time.',
    },
    'CODE-APPROVED': {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            'Approved! The code is now being prepared to run in the enclave. No further action is needed at this time.',
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: 'Rejected. The research lab now needs to revise and submit an updated version.',
    },
    'CODE-REJECTED': {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: 'Rejected. The research lab now needs to revise and submit an updated version.',
    },

    // Code
    'JOB-PACKAGING': {
        stage: 'Code',
        label: 'Packaging',
        tooltip: 'Preparing code to run in enclave. If it stays in this status for over 1h, contact SI admins.',
    },
    'JOB-READY': {
        stage: 'Code',
        label: 'Ready',
        tooltip:
            'The code is packaged and ready to be picked up by the enclave. If it stays in this status for over 1h, contact your Org Admin.',
    },
    'JOB-RUNNING': {
        stage: 'Code',
        label: 'Processing',
        tooltip:
            "The code is now running against the enclave. You'll receive an email once results are ready for review.",
    },
    'JOB-ERRORED': {
        stage: 'Code',
        label: 'Errored',
        tooltip: 'The code ran into an error. Open the study for more details.',
    },

    // Results
    'RUN-COMPLETE': {
        stage: 'Results',
        label: 'Awaiting Review',
        tooltip: 'Study results are now ready for review. Open the study for more details.',
    },
    'FILES-APPROVED': {
        stage: 'Results',
        label: 'Approved',
        tooltip: 'Approved! Study results have now been shared with the Researcher.',
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'Sharing of results was rejected. The research lab now needs to revise and submit an updated version.',
    },
}

// Proposal -> Results
export const RESEARCHER_STATUS_LABELS: Partial<Record<AllStatus, StatusLabel>> = {
    // Proposal
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Under Review',
        tooltip: "Your proposal is being reviewed. You'll receive an email once a decision is made.",
    },
    'CODE-SUBMITTED': {
        stage: 'Proposal',
        label: 'Under Review',
        tooltip: "Your proposal is being reviewed. You'll receive an email once a decision is made.",
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            "Your proposal has been approved, and its code is now running! You'll receive an email as soon as your results are ready.",
    },
    'CODE-APPROVED': {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            "Your proposal has been approved, and its code is now running! You'll receive an email as soon as your results are ready.",
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: "Your proposal has not been approved. Click 'Propose New Study' to submit a new proposal.",
    },
    'CODE-REJECTED': {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: "Your proposal has not been approved. Click 'Propose New Study' to submit a new proposal.",
    },
    'JOB-ERRORED': {
        stage: 'Code',
        label: 'Errored',
        tooltip: 'Your study code need revision. Open your study for more details.',
    },

    // Results
    'RUN-COMPLETE': {
        stage: 'Results',
        label: 'Under Review',
        tooltip:
            "Your code ran successfully! The results are now under review. You'll receive an email once a decision is made.",
    },
    'FILES-APPROVED': {
        stage: 'Results',
        label: 'Approved',
        tooltip: 'The results of your analysis have been approved! Open your study to access them.',
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'The results of your analysis have not been approved. Open your study for more details.',
    },
}
