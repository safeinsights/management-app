import { type UserSession, isLabOrg, isEnclaveOrg } from './types'
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
    const { isAdmin: isOrgAdmin } = session.org
    const isResearcher = isLabOrg(session.org)
    const isReviewer = isEnclaveOrg(session.org)
    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // https://casl.js.org/v6/en/guide/conditions-in-depth
    // rules use mongodb query conditions: https://casl.js.org/v6/en/guide/conditions-in-depth

    // action all users can perform
    permit('update', 'User', { id: session.user.id })
    permit('claim', 'PendingUser')
    permit('reset', 'MFA')

    permit('view', 'Org', { orgSlug: session.org.slug })

    if (isResearcher || isReviewer || isOrgAdmin) {
        permit('view', 'Study', { orgId: session.org.id })
        permit('view', 'StudyJob', { orgId: session.org.id })
        permit('view', 'Org', { orgSlug: session.org.slug })
    }

    if (isResearcher || isOrgAdmin) {
        permit('create', 'Study', { orgId: session.org.id })
        permit('create', 'StudyJob', { orgId: session.org.id })
        permit('update', 'Study', { orgId: session.org.id })
        permit('delete', 'Study', { orgId: session.org.id })
        permit('delete', 'StudyJob', { orgId: session.org.id })
    }

    if (isReviewer || isOrgAdmin) {
        permit('view', 'ReviewerKey')
        permit('update', 'ReviewerKey')
        permit('approve', 'Study', { orgId: session.org.id })
        permit('reject', 'Study', { orgId: session.org.id })
        permit('view', 'Study', { orgId: session.org.id })
        permit('review', 'Study', { orgId: session.org.id })
    }

    if (isOrgAdmin) {
        permit('update', 'User', { orgId: session.org.id })
        permit('invite', 'User', { orgId: session.org.id })
        permit('view', 'User', { orgSlug: session.org.slug })
        permit('view', 'Org', { orgSlug: session.org.slug })
        permit('view', 'OrgMembers', { orgSlug: session.org.slug })
        permit('update', 'Org', { orgSlug: session.org.slug })
    }

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
