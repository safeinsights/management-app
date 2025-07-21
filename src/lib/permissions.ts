import { type StudyStatus } from '@/database/types'
import { type UserSession } from './types'
import { AbilityBuilder, MongoAbility, createMongoAbility, subject } from '@casl/ability'

export { subject }

type Record = { id: string }
type RecordWithOrgId = { orgId: string }
type Study = { study: { orgId: string } }

type Abilities =
    | ['invite', 'User']
    | ['claim', 'PendingUser']
    | ['update', 'User' | Record]
    | ['read', 'User' | Record]
    | ['read' | 'update', 'ReviewerKey' | { userId: string }]
    | ['read' | 'update' | 'create' | 'delete', 'Team' | RecordWithOrgId]
    | ['view' | 'update' | 'delete' | 'review', 'Study' | Study]
    | ['read' | 'create', 'StudyJob' | Study]
    | ['create' | 'read', 'Study' | { orgId: string }]
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
    permit('claim', 'PendingUser')

    permit('read', 'Team', { orgSlug: session.team.slug })
    permit('read', 'Team', { id: session.team.id })

    if (isResearcher || isReviewer || isTeamAdmin) {
        permit('view', 'Study', { 'study.orgId': session.team.id }) //orgId: session.team.id })
    }

    if (isResearcher || isTeamAdmin) {
        permit('create', 'Study')
        permit('create', 'StudyJob')

        permit('update', 'Study', { orgId: session.team.id })
        permit('delete', 'Study', { orgId: session.team.id })
    }

    if (isReviewer || isTeamAdmin) {
        permit('read', 'ReviewerKey')
        permit('update', 'ReviewerKey')
        permit('approve', 'Study')
        permit('reject', 'Study')
        permit('read', 'Study', { orgSlug: session.team.slug })
        permit('review', 'Study', { 'study.orgId': session.team.id })
        permit('read', 'StudyJob', { 'studyJob.orgId': session.team.id })
    }

    if (isTeamAdmin) {
        permit('invite', 'User', { orgSlug: session.team.slug })
        permit('update', 'User', { orgId: session.team.id })
        permit('read', 'User', { orgId: session.team.id })

        permit('read', 'User', { orgSlug: session.team.slug })
        permit('read', 'Team', { orgSlug: session.team.slug })
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
