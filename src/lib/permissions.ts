import { type StudyStatus } from '../database/types'
import { UUID, type UserSession } from './types'
import { AbilityBuilder, MongoAbility, createMongoAbility, subject } from '@casl/ability'

export { subject }

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
type Ability<Kind extends string, Actions extends string, Properties extends Record<string, any>> = [
    Actions,
    Kind | ({
        kind: Kind
    } & Properties),
]

export function toRecord<T extends string, Properties extends Record<string, any>>(typeName: T, props: Properties): { kind: T } & Properties {
    return ({ kind: typeName, ...props })
}

// this list determines the possible subject, types, and actions that can be permitted/denied.
// it also controls the types allowed by the Action#requireAbilityTo  method
type Abilities =
    | Ability<'User', 'invite' | 'update' | 'view' | 'invite', { id?: UUID, orgId?: UUID } >
    | Ability<'PendingUser', 'claim', {}>
    | Ability<'TeamMembers', 'view', { orgSlug: string }>
    | Ability<'Study', 'view' | 'create' | 'review' | 'approve' | 'reject' | 'update' | 'delete', { orgId: UUID }>
    | Ability<'StudyJob', 'view' | 'create', { orgId: UUID }>
    | Ability<'ReviewerKey', 'view' | 'update', { }>
    | Ability<'Team', 'view' | 'update' | 'create' | 'delete', { orgId?: UUID, orgSlug?: string }>
    | Ability<'TeamMembers', 'view', { orgId?: UUID, orgSlug?: string }>
    | Ability<'Org', 'view' | 'delete', { orgId?: UUID, orgSlug?: string }>
    | Ability<'Orgs', 'view', { }>

export type PermissionsObjectSubjects = Extract<Abilities[1], object>;

export type PermissionsActionSubjectMap = {
  [K in Abilities as K[0]]: Extract<K[1], string>;
};

export type PermissionsSubjectToObjectMap = {
  [K in PermissionsObjectSubjects as K['kind']]: Omit<K, 'kind'>;
};

//     | ['view', 'Team' | { orgSlug: string } | { id: UUID }]
//     | ['view', 'Study' | { 'study.orgId': UUID }]
//     | ['view', 'StudyJob' | { orgId: UUID }]
//     | ['create', 'Study']
//     | ['create', 'StudyJob']
//     | ['update', 'Study' | { orgId: UUID }]
//     | ['delete', 'Study' | { orgId: UUID }]
//     | ['view', 'ReviewerKey']
//     | ['update', 'ReviewerKey']
//     | ['approve', 'Study']
//     | ['reject', 'Study']
//     | ['view', 'Study' | { orgSlug: string }]
//     | ['review', 'Study' | { 'study.orgId': UUID }]
//     | ['invite', 'User' | { orgSlug: string }]
// //    | ['update', 'User' | { 'user.orgId': UUID }]
//     | Ability<'User', { orgId: UUID } | { orgSlug: string }, 'view' >
//     | ['update', 'Team' | { orgSlug: string }]
//     | ['create', 'Team']
//     | ['update', 'User']
// //    | ['view', 'User']
//     | ['invite', 'User']
//     | ['view', 'Team']
//     | ['update', 'Team']
//     | ['delete', 'Team']

//-:| ['view', 'User' | Record]
//    | ['view' | 'update', 'ReviewerKey' | { userId: string }]
//.VolumeIcon.icns    | [, 'Team' | RecordWithOrgId]
//    | ['view' | 'update' | 'delete' | 'review', 'Study' | Study]
//    | ['view' | 'create', 'StudyJob' | Study]
//    | ['create' | 'view', 'Study' | { orgId: string }]
//| ['approve' | 'reject', 'Study' | { orgId: string; status: StudyStatus }]

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

    permit('view', 'Team', { orgSlug: session.team.slug })
    //permit('view', 'Team', { id: session.team.id })

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
        permit('view', 'Study', { orgId: session.team.id})
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

    return build()
}
