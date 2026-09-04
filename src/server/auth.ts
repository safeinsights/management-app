import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'
import { db } from '@/database'
import { userAcknowledgedVersion, type LegalDocumentAudience } from '@/server/db/legal-document'
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

// Three ways in, matching the three screens that link a document: an SI admin (`view` on
// LegalDocument is granted to nobody else), an admin of a party org, or the person whose own
// acknowledgement it is.
export async function canDownloadLegalDocument(doc: LegalDocumentAudience) {
    const session = await sessionFromClerk()
    if (!session) return false

    if (session.can('view', toRecord('LegalDocument', {}))) return true

    const audienceOrgIds = [doc.orgId, doc.dataPartnerId, doc.researchLabId].filter((id): id is string => id != null)
    if (audienceOrgIds.some((orgId) => session.can('view', toRecord('OrgLegalDocuments', { orgId })))) return true

    return userAcknowledgedVersion(db, { versionId: doc.versionId, userId: session.user.id })
}
