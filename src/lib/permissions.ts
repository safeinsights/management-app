import { StudyStatus } from '@/database/types'
import { type UserSession } from './types'
import { AbilityBuilder, MongoAbility, createMongoAbility } from '@casl/ability'

type Record = { id: string }

type Abilities =
    | ['invite', 'User']
    | ['update', 'User' | Record]
    | ['read', 'User' | Record]
    | ['read', 'Study' | { id: string; orgId: string }]
    | ['read' | 'update', 'ReviewerKey' | { userId: string }]
    | ['read' | 'update' | 'create' | 'delete', 'Team' | Record]
    | ['read' | 'create', 'StudyJob' | Record]
    | ['create' | 'read', 'Study']
    | ['approve' | 'reject', 'Study' | { orgId: string; status: StudyStatus }]

export type AppAbility = MongoAbility<Abilities>

export function defineAbilityFor(session: UserSession) {
    const { isSiAdmin } = session.user
    const { isAdmin: isTeamAdmin, isResearcher, isReviewer } = session.team
    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // https://casl.js.org/v6/en/guide/conditions-in-depth
    // rules use mongodb query conditions: https://casl.js.org/v6/en/guide/conditions-in-depth

    // action all users can perform
    permit('update', 'User', { id: session.user.id })

    permit('read', 'Team', { orgSlug: session.team.slug })
    permit('read', 'Team', { id: session.team.id })

    if (isResearcher || isReviewer || isTeamAdmin) {
        permit('read', 'Study', { orgId: session.team.id })
    }

    if (isResearcher || isTeamAdmin) {
        permit('create', 'Study')
        permit('create', 'StudyJob')
    }

    if (isReviewer || isTeamAdmin) {
        permit('read', 'ReviewerKey', { userId: session.user.id })
        permit('update', 'ReviewerKey', { userId: session.user.id })
        permit('approve', 'Study')
        permit('reject', 'Study')
        permit('read', 'StudyJob')
    }

    if (isTeamAdmin) {
        permit('invite', 'User')
        permit('update', 'User')

        permit('read', 'User', { teamId: session.team.id })
        permit('update', 'Team', { orgSlug: session.team.slug })
    }

    if (isSiAdmin) {
        permit('create', 'Team')
        permit('read', 'Team')
        permit('update', 'Team')
        permit('delete', 'Team')
    }

    return build()
}
