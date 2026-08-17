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

// Which study statuses a Data Organization (enclave reviewer) may read: every status except DRAFT,
// i.e. "has been submitted at least once". Unsubmitted drafts belong to the Research Lab only
// (OTTER-596). Declared as a Record<StudyStatus, …> so adding a new StudyStatus is a TypeScript error
// until someone makes an explicit visible/hidden decision here — the one constant the whole read
// boundary hinges on.
const ENCLAVE_VIEWABLE_STUDY_STATUS: Record<StudyStatus, boolean> = {
    DRAFT: false,
    'PENDING-REVIEW': true,
    'CHANGE-REQUESTED': true,
    APPROVED: true,
    REJECTED: true,
    ARCHIVED: true,
}

// Derived allowlist used as a positive `$in` condition. Positive on purpose — the ability subject is
// assembled from middleware-returned fields, and a mongo `$in` fails CLOSED when `status` is absent
// (denies), whereas `$ne: 'DRAFT'` would fail OPEN (grant): the safe direction for a fix about hiding
// content.
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

    // https://casl.js.org/v6/en/guide/conditions-in-depth
    // rules use mongodb query conditions: https://casl.js.org/v6/en/guide/conditions-in-depth

    // action all users can perform
    permit('update', 'User', { id: session.user.id })
    permit('claim', 'PendingUser')
    permit('reset', 'MFA')
    permit('view', 'Orgs')

    // Who may acknowledge a document is who the document binds. tos/pn are global, so everyone; a
    // ropa/dopa binds its org's members and an sla binds both of its study's orgs, which the actions'
    // middleware resolves into audienceOrgIds. Two OR-combined rules rather than one unconditioned
    // rule, so a crafted versionId cannot record consent to another org's agreement. Both conditions
    // fail closed when their field is absent. Deliberately does NOT widen 'view', which would hand
    // every user the SI-admin acknowledgement audit listings.
    permit('acknowledge', 'LegalDocument', { isGlobal: true })
    permit('acknowledge', 'LegalDocument', { audienceOrgIds: { $in: usersOrgIds } })

    // viewing all studies the user has permission for, the action will filter
    permit('view', 'Studies')

    permit('load', 'IDE', { researcherId: session.user.id })

    permit('view', 'OrgStudies', { orgType: 'enclave', orgId: { $in: usersReviewerOrgIds } })
    permit('view', 'OrgStudies', { orgType: 'lab', orgId: { $in: usersResearcherOrgIds } })

    permit('view', 'OrgMembers', { orgId: { $in: usersOrgIds } })

    // Deliberately unconditioned, and it must stay that way: a lab researcher composing a study
    // proposal has to read enclave orgs they do not belong to in order to pick a dataset (97c118b1).
    // The narrowing therefore lives in the ACTIONS, not here — an action gated on `view Org` may
    // only return catalog-level data (identity + advertised datasets) that we are content to show
    // any authenticated user. Anything carrying an org's configuration or secrets belongs on
    // `view OrgConfig` below (OTTER-724 / MA-6).
    permit('view', 'Org')

    // Org configuration reads: code-env settings (plaintext env vars, commonly credentials),
    // scan results, and starter code contents. Scoped to admins of that org; SI admins pick it up
    // via ('manage','all').
    permit('view', 'OrgConfig', { orgId: { $in: usersAdminOrgIds } })

    // Enclave (Data Organization) reviewers may only view SUBMITTED studies/jobs. Unsubmitted drafts
    // (proposal content + uploaded code) stay private to the submitting Research Lab, which retains
    // access via the submittedByOrgId rules below (OTTER-596).
    permit('view', 'Study', { orgId: { $in: usersReviewerOrgIds }, status: { $in: SUBMITTED_STUDY_STATUSES } })
    permit('view', 'StudyJob', { orgId: { $in: usersReviewerOrgIds }, status: { $in: SUBMITTED_STUDY_STATUSES } })

    permit('view', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })

    // users who belong to any research orgs can create studies for ANY enclave org, but only ON
    // BEHALF OF one of their own labs: onSaveDraftStudyAction's middleware resolves the requested
    // submitting-lab slug into submittedByOrgId, so create is scoped here exactly like update and
    // delete (OTTER-719). A lab member can neither reach another lab's study by guessing its id nor
    // create one attributed to a lab they don't belong to.
    if (usersResearcherOrgIds.length) {
        permit('create', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('update', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('delete', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('create', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        // OTTER-719: previously unconditioned, which granted every lab member read/write/delete
        // on every study's workspace files. A `$in` fails closed when the field is missing.
        permit('load', 'IDE', { submittedByOrgId: { $in: usersResearcherOrgIds } })
    }

    // can view studies and jobs for all orgs that the user's org has submitted
    permit('view', 'Study', { submittedByOrgId: { $in: usersOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersOrgIds } })

    // every user holds a key
    permit('view', 'UserKey')
    permit('update', 'UserKey')

    // allow review of studies for enclave orgs that the user belongs to
    permit('approve', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('reject', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('review', 'Study', { orgId: { $in: usersReviewerOrgIds } })

    // admins can update and invite
    permit('update', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('invite', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('view', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'Org', { orgId: { $in: usersAdminOrgIds } })

    // Role changes use their own verb rather than reusing `update User`. The self-profile rule
    // above (line ~51) grants every user `update User` on their own id, so gating role changes
    // on `update` let any member promote themselves to admin (OTTER-720). There is deliberately
    // no id-keyed `manageRole` rule; changing your own role is refused in the action handler.
    permit('manageRole', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('revoke', 'PendingUser', { orgId: { $in: usersAdminOrgIds } })

    permit('view', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })

    // SI admins can do anything. ('manage','all') is CASL's wildcard — it matches every action
    // on every subject at runtime, including review/approve/reject for studies of orgs the SI
    // admin is not a member of. Replaces the previous enumerated list, which omitted the review
    // actions and left SI admins unable to review studies.
    if (isSiAdmin) {
        permit('manage', 'all')
    }

    return build({
        detectSubjectType: (object) => object[TYPE_FIELD],
    })
}
