import { type UserSession, isLabOrg, isEnclaveOrg, isOrgAdmin } from './types'
import type { StudyStatus } from '@/database/types'
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability'
import {
    AppAbility,
    PermissionsActionSubjectMap,
    PermissionsSubjectToObjectMap,
    toRecord,
    TYPE_FIELD,
} from './permission-types'

export { subject, type AppAbility, type PermissionsActionSubjectMap, type PermissionsSubjectToObjectMap, toRecord }

// A Record<StudyStatus, …> so a new StudyStatus is a TypeScript error until someone makes an
// explicit visible/hidden decision (OTTER-596).
const ENCLAVE_VIEWABLE_STUDY_STATUS: Record<StudyStatus, boolean> = {
    DRAFT: false,
    'PENDING-REVIEW': true,
    'CHANGE-REQUESTED': true,
    APPROVED: true,
    REJECTED: true,
    ARCHIVED: true,
}

// Positive `$in` on purpose: it fails CLOSED when `status` is absent from the subject, whereas
// `$ne: 'DRAFT'` would fail OPEN.
const SUBMITTED_STUDY_STATUSES = (Object.keys(ENCLAVE_VIEWABLE_STUDY_STATUS) as StudyStatus[]).filter(
    (status) => ENCLAVE_VIEWABLE_STUDY_STATUS[status],
)

export function defineAbilityFor(session: UserSession) {
    const { isSiAdmin } = session.user
    const orgs = Object.values(session.orgs)
    const usersOrgIds = orgs.map((o) => o.id)

    const usersAdminOrgIds = orgs.filter(isOrgAdmin).map((o) => o.id)
    const usersReviewerOrgIds = orgs.filter(isEnclaveOrg).map((o) => o.id)
    const usersResearcherOrgIds = orgs.filter(isLabOrg).map((o) => o.id)

    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // rules use mongodb query conditions: https://casl.js.org/v6/en/guide/conditions-in-depth
    permit('update', 'User', { id: session.user.id })
    permit('claim', 'PendingUser')
    permit('reset', 'MFA')
    permit('view', 'Orgs')

    // Two OR-combined conditioned rules, so a crafted versionId cannot record consent to another
    // org's agreement.
    permit('acknowledge', 'LegalDocument', { isGlobal: true })
    permit('acknowledge', 'LegalDocument', { audienceOrgIds: { $in: usersOrgIds } })

    // Not a widened ('view','LegalDocument'): those actions take their scope from client params,
    // so it would expose drafts and version history.
    permit('view', 'OrgLegalDocuments', { orgId: { $in: usersAdminOrgIds } })

    // Unconditioned; the action itself filters to what the user may see.
    permit('view', 'Studies')

    permit('load', 'IDE', { researcherId: session.user.id })

    permit('view', 'OrgStudies', { orgType: 'enclave', orgId: { $in: usersReviewerOrgIds } })
    permit('view', 'OrgStudies', { orgType: 'lab', orgId: { $in: usersResearcherOrgIds } })

    permit('view', 'OrgMembers', { orgId: { $in: usersOrgIds } })

    // Must stay unconditioned: composing a proposal means reading enclave orgs the researcher does
    // not belong to. An action gated on this may return only catalog data, never secrets (MA-6).
    permit('view', 'Org')

    permit('view', 'OrgConfig', { orgId: { $in: usersAdminOrgIds } })

    // Unsubmitted drafts stay private to the submitting Research Lab, which keeps access via the
    // submittedByOrgId rules below (OTTER-596).
    permit('view', 'Study', { orgId: { $in: usersReviewerOrgIds }, status: { $in: SUBMITTED_STUDY_STATUSES } })
    permit('view', 'StudyJob', { orgId: { $in: usersReviewerOrgIds }, status: { $in: SUBMITTED_STUDY_STATUSES } })

    permit('view', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })

    // Lab members create studies for ANY enclave org but only ON BEHALF OF one of their own labs
    // (OTTER-719).
    if (usersResearcherOrgIds.length) {
        permit('create', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('update', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('delete', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('create', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        // Conditioned so it fails closed when submittedByOrgId is missing (OTTER-719).
        permit('load', 'IDE', { submittedByOrgId: { $in: usersResearcherOrgIds } })
    }

    permit('view', 'Study', { submittedByOrgId: { $in: usersOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersOrgIds } })

    permit('view', 'UserKey')
    permit('update', 'UserKey')

    permit('approve', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('reject', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('review', 'Study', { orgId: { $in: usersReviewerOrgIds } })

    permit('update', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('invite', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('view', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'Org', { orgId: { $in: usersAdminOrgIds } })

    // Own verb rather than `update User`: every user holds `update User` on their own id, so
    // gating role changes on `update` let a member promote themselves to admin (OTTER-720).
    permit('manageRole', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('revoke', 'PendingUser', { orgId: { $in: usersAdminOrgIds } })

    permit('view', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })

    // CASL's wildcard, needed because SI admins review studies of orgs they do not belong to.
    if (isSiAdmin) {
        permit('manage', 'all')
    }

    return build({
        detectSubjectType: (object) => object[TYPE_FIELD],
    })
}
