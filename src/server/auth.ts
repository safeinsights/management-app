import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'
import type { StudyStatus } from '@/database/types'

// `status` gates the reviewer path only: unsubmitted drafts are private to the submitting lab,
// whose own path stays status-agnostic (OTTER-596).
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
