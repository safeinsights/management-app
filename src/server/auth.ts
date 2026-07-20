import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'
import type { StudyStatus } from '@/database/types'

// `status` gates the reviewer (enclave/Data Organization) path only — unsubmitted drafts are private
// to the submitting Research Lab (OTTER-596). The lab path (submittedByOrgId) is intentionally
// status-agnostic so a lab keeps access to its own drafts. Guards the direct download routes
// (study-code, study-documents, results) against a DO fetching a draft by known id.
export async function canViewStudyResults(study: { orgId: string; submittedByOrgId: string; status: StudyStatus }) {
    const session = await sessionFromClerk()

    return (
        session &&
        (session.can('view', toRecord('Study', { orgId: study.orgId, status: study.status })) ||
            session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId })))
    )
}

export async function canViewStudyJob(study: { orgId: string; submittedByOrgId: string; status: StudyStatus }) {
    const session = await sessionFromClerk()

    return (
        session &&
        (session.can('view', toRecord('StudyJob', { orgId: study.orgId, status: study.status })) ||
            session.can('view', toRecord('StudyJob', { submittedByOrgId: study.submittedByOrgId })))
    )
}
