import { StudyStatus } from '@/database/types'
import { CLERK_ADMIN_ORG_SLUG, type UserSession } from './types'
import { AbilityBuilder, MongoAbility, createMongoAbility, type FieldMatcher } from '@casl/ability'

const fieldMatcher: FieldMatcher = (fields) => (field) => fields.includes(field)

type Record = { id: string }

type Abilities =
    | ['invite', 'User']
    | ['update', 'User' | Record]
    | ['read', 'User' | Record]
    | ['read' | 'update', 'ReviewerKey' | { userId: string }]
    | ['read' | 'update', 'OwnTeam' | Record]
    | ['delete' | 'insert' | 'read', 'AnyTeam']
    | ['create', 'Study']
    | ['approve', 'Study' | { orgId: string; status: StudyStatus }]

export type AppAbility = MongoAbility<Abilities>

export function defineAbilityFor(session: UserSession) {
    const { isAdmin: isTeamAdmin, isResearcher, isReviewer } = session.team
    const isSiAdmin = isTeamAdmin && session.team.slug == CLERK_ADMIN_ORG_SLUG
    const { can: permit, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // action all users can perform
    permit('update', 'User', { id: session.user.id })

    permit('read', 'OwnTeam', { id: session.team.id })

    if (isResearcher || isTeamAdmin) {
        permit('create', 'Study')
    }

    if (isReviewer || isTeamAdmin) {
        permit('read', 'ReviewerKey', { userId:  session.user.id })
        permit('update', 'ReviewerKey', { userId:  session.user.id })
        permit('approve', 'Study', { status: { $in: ['INITIATED', 'PENDING-REVIEW'] } })
    }

    if (isTeamAdmin) {
        permit('invite', 'User')
        permit('update', 'User')

        permit('read', 'User', { teamId: session.team.id })
        permit('update', 'OwnTeam', { id: session.team.id })
    }

    if (isSiAdmin) {
        permit('insert', 'AnyTeam')
        permit('read', 'AnyTeam')
        permit('delete', 'AnyTeam')
    }

    return build({ fieldMatcher })
}
