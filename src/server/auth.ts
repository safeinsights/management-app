import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'

export async function canViewStudyResults(study: { orgId: string; submittedByOrgId: string }) {
    const session = await sessionFromClerk()

    return (
        session &&
        (session.can('view', toRecord('Study', { orgId: study.orgId })) ||
            session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId })))
    )
}

export async function canViewStudyJob(study: { orgId: string; submittedByOrgId: string }) {
    const session = await sessionFromClerk()

    return (
        session &&
        (session.can('view', toRecord('StudyJob', { orgId: study.orgId })) ||
            session.can('view', toRecord('StudyJob', { submittedByOrgId: study.submittedByOrgId })))
    )
}
