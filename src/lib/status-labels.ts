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
    // note: there is no 'DRAFT' label here even though that status exists on studies
    // BECAUSE a reviewer should never see a DRAFT study

    // Proposal
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Needs Review',
        tooltip: 'This proposal is now ready for review. Open the study for more details.',
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip:
            "This study proposal has been approved. It's now on the Researcher to submit their code for review. You'll receive an email once it's ready.",
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip:
            "This study proposal has been rejected. It's now on the Researcher to revise and submit an updated version of their proposal. You'll receive an email once it's ready.",
    },

    // Code
    'CODE-SUBMITTED': {
        stage: 'Code',
        label: 'Needs Review',
        tooltip: 'This study code is now ready for review. Open the study for more details.',
    },
    'CODE-SCANNED': {
        stage: 'Code',
        label: 'Needs Review',
        tooltip: 'This study code is now ready for review. Open the study for more details.',
    },
    'CODE-APPROVED': {
        stage: 'Code',
        label: 'Approved',
        tooltip:
            'This study code has been approved and is now being prepared to run in the enclave. No further action is needed at this time.',
    },
    'CODE-REJECTED': {
        stage: 'Code',
        label: 'Rejected',
        tooltip:
            "This study code has been rejected. It's now on the Researcher to revise and submit an updated version of their code. You'll receive an email once it's ready.",
    },
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
        label: 'Needs Review',
        tooltip: 'Study results are now ready for review. Open the study for more details.',
    },
    'FILES-APPROVED': {
        stage: 'Results',
        label: 'Ready',
        tooltip: 'Approved! Study results have now been shared with the Researcher.',
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'Sharing of results was rejected. The research lab now needs to revise and submit an updated version.',
    },
}

// Proposal -> Code -> Results
export const RESEARCHER_STATUS_LABELS: Partial<Record<AllStatus, StatusLabel>> = {
    // Proposal
    DRAFT: {
        stage: 'Proposal',
        label: 'Draft',
    },
    'PENDING-REVIEW': {
        stage: 'Proposal',
        label: 'Under Review',
        tooltip: "Your study proposal is being reviewed. You'll receive an email once a decision is made.",
    },
    APPROVED: {
        stage: 'Proposal',
        label: 'Approved',
        tooltip: 'Your study proposal has been approved! Open your study to submit your code.',
    },
    REJECTED: {
        stage: 'Proposal',
        label: 'Rejected',
        tooltip: 'Your study proposal needs revision. Open your study for more details.',
    },

    // Code
    INITIATED: {
        stage: 'Code',
        label: 'Draft',
    },
    'CODE-SUBMITTED': {
        stage: 'Code',
        label: 'Under Review',
        tooltip: "Your study code is being reviewed. You'll receive an email once a decision is made.",
    },
    'CODE-SCANNED': {
        stage: 'Code',
        label: 'Under Review',
        tooltip: "Your study code is being reviewed. You'll receive an email once a decision is made.",
    },
    'CODE-APPROVED': {
        stage: 'Code',
        label: 'Approved',
        tooltip:
            "Your study code has been approved and is now being executed! You'll receive an email once results are ready.",
    },
    'CODE-REJECTED': {
        stage: 'Code',
        label: 'Rejected',
        tooltip: 'Your study code needs revision. Open your study for more details.',
    },
    'JOB-ERRORED': {
        stage: 'Code',
        label: 'Errored',
        tooltip: 'Your study code needs revision. Open your study for more details.',
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
        label: 'Ready',
        tooltip: 'The results of your analysis have been approved! Open your study to access them.',
    },
    'FILES-REJECTED': {
        stage: 'Results',
        label: 'Rejected',
        tooltip: 'The results of your analysis have not been approved. Open your study for more details.',
    },
}
