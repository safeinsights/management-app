import { type UserSession } from './types'
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
    const { isAdmin: isTeamAdmin, isResearcher, isReviewer } = session.team
    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // https://casl.js.org/v6/en/guide/conditions-in-depth
    // rules use mongodb query conditions: https://casl.js.org/v6/en/guide/conditions-in-depth

    // action all users can perform
    permit('update', 'User', { id: session.user.id })
    permit('claim', 'PendingUser')

    permit('view', 'Team', { orgSlug: session.team.slug })

    if (isResearcher || isReviewer || isTeamAdmin) {
        permit('view', 'Study', { orgId: session.team.id })
        permit('view', 'StudyJob', { orgId: session.team.id })
        permit('view', 'Team', { orgSlug: session.team.slug })
    }

    if (isResearcher || isTeamAdmin) {
        permit('create', 'Study', { orgId: session.team.id })
        permit('create', 'StudyJob', { orgId: session.team.id })
        permit('update', 'Study', { orgId: session.team.id })
        permit('delete', 'Study', { orgId: session.team.id })
    }

    if (isReviewer || isTeamAdmin) {
        permit('view', 'ReviewerKey')
        permit('update', 'ReviewerKey')
        permit('approve', 'Study', { orgId: session.team.id })
        permit('reject', 'Study', { orgId: session.team.id })
        permit('view', 'Study', { orgId: session.team.id })
        permit('review', 'Study', { orgId: session.team.id })
    }

    if (isTeamAdmin) {
        permit('update', 'User', { orgId: session.team.id })
        permit('invite', 'User', { orgId: session.team.id })
        permit('view', 'User', { orgId: session.team.id })
        permit('view', 'Team', { orgSlug: session.team.slug })
        permit('view', 'TeamMembers', { orgSlug: session.team.slug })
        permit('update', 'Team', { orgSlug: session.team.slug })
    }

    if (isSiAdmin) {
        permit('create', 'Team')
        permit('update', 'User')
        permit('view', 'User')
        permit('invite', 'User')
        permit('view', 'Team')
        permit('update', 'Team')
        permit('delete', 'Team')
        permit('view', 'Orgs')
        permit('view', 'Org')
        permit('delete', 'Org')
    }

    return build({
        detectSubjectType: (object) => object[TYPE_FIELD],
    })
}
