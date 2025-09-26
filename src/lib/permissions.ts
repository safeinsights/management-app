import { type UserSession, isLabOrg, isEnclaveOrg, isOrgAdmin } from './types'
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability'
import {
    AppAbility,
    PermissionsActionSubjectMap,
    PermissionsSubjectToObjectMap,
    toRecord,
    TYPE_FIELD,
} from './permission-types'

export { subject, type AppAbility, type PermissionsActionSubjectMap, type PermissionsSubjectToObjectMap, toRecord }

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

    // everyone can view studies, the action will return the appropriate listing
    permit('view', 'Studies')

    permit('view', 'OrgMembers', { orgId: { $in: usersOrgIds } })

    // can view orgs, studies and jobs for all orgs that the user belongs to
    permit('view', 'Org', { orgId: { $in: usersOrgIds } })
    permit('view', 'Study', { orgId: { $in: usersOrgIds } })
    permit('view', 'StudyJob', { orgId: { $in: usersOrgIds } })

    // users who belong to any researche orgs can create studies for ANY org
    if (usersResearcherOrgIds.length) {
        permit('create', 'Study')
        permit('update', 'Study')
        permit('delete', 'Study')
        permit('create', 'StudyJob')
        permit('delete', 'StudyJob')
    }

    // can view studies and jobs for all orgs that the user's org has submitted
    permit('view', 'Study', { submittedByOrgId: { $in: usersOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersOrgIds } })

    // user who belong to any enclave orgs can view/create/update thier keys
    if (usersReviewerOrgIds.length) {
        permit('view', 'ReviewerKey')
        permit('update', 'ReviewerKey')
    }

    // allow review of studies for enclave orgs that the user belongs to
    permit('approve', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('reject', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('review', 'Study', { orgId: { $in: usersReviewerOrgIds } })

    // admins can update and invite
    permit('update', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('invite', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('view', 'User', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'Org', { orgId: { $in: usersAdminOrgIds } })

    // SI admins can do anythig
    if (isSiAdmin) {
        permit('create', 'Org')
        permit('update', 'User')
        permit('view', 'User')
        permit('invite', 'User')
        permit('view', 'Study')
        permit('view', 'StudyJob')
        permit('view', 'Org')
        permit('update', 'Org')
        permit('delete', 'Org')
        permit('view', 'Orgs')
    }

    return build({
        detectSubjectType: (object) => object[TYPE_FIELD],
    })
}
