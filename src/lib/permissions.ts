import { type UserSession, isLabOrg, isEnclaveOrg, isOrgAdmin, orgNeedsKey } from './types'
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
    permit('view', 'Orgs')

    // viewing all studies the user has permission for, the action will filter
    permit('view', 'Studies')

    permit('load', 'IDE', { researcherId: session.user.id })

    permit('view', 'OrgStudies', { orgType: 'enclave', orgId: { $in: usersReviewerOrgIds } })
    permit('view', 'OrgStudies', { orgType: 'lab', orgId: { $in: usersResearcherOrgIds } })

    permit('view', 'OrgMembers', { orgId: { $in: usersOrgIds } })
    // in the future we may narrow this, but right now
    // researchers need to be able to view enclave orgs to create studies
    permit('view', 'Org')

    permit('view', 'Study', { orgId: { $in: usersReviewerOrgIds } })
    permit('view', 'StudyJob', { orgId: { $in: usersReviewerOrgIds } })

    permit('view', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })

    // users who belong to any research orgs can create studies for ANY org.
    // create is unconditioned: a new draft has no submittedByOrgId yet — the
    // submitting lab is chosen in the handler from the user's own orgs. update,
    // delete, and job mutations are scoped to studies the user's lab submitted,
    // so a lab member can't mutate another lab's study by guessing its id.
    if (usersResearcherOrgIds.length) {
        permit('create', 'Study')
        permit('update', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('delete', 'Study', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('create', 'StudyJob', { submittedByOrgId: { $in: usersResearcherOrgIds } })
        permit('load', 'IDE')
    }

    // can view studies and jobs for all orgs that the user's org has submitted
    permit('view', 'Study', { submittedByOrgId: { $in: usersOrgIds } })
    permit('view', 'StudyJob', { submittedByOrgId: { $in: usersOrgIds } })

    // users who belong to any key-holding org (enclave or lab) can view/create/update their keys
    if (orgs.some(orgNeedsKey)) {
        permit('view', 'UserKey')
        permit('update', 'UserKey')
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

    permit('view', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })
    permit('update', 'AgentContext', { orgId: { $in: usersAdminOrgIds } })

    // SI admins can do anything
    if (isSiAdmin) {
        permit('create', 'Org')
        permit('update', 'User')
        permit('view', 'User')
        permit('invite', 'User')
        permit('view', 'Study')
        permit('view', 'StudyJob')
        permit('update', 'Org')
        permit('delete', 'Org')
        permit('view', 'OrgStudies')
        permit('view', 'OrgMembers')
        permit('view', 'AgentContext')
        permit('create', 'AgentContext')
        permit('update', 'AgentContext')
    }

    return build({
        detectSubjectType: (object) => object[TYPE_FIELD],
    })
}
