import { UUID } from './types'
import { MongoAbility } from '@casl/ability'

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
type Ability<Kind extends string, Actions extends string, Properties extends Record<string, any>> = [
    Actions,
    (
        | Kind
        | ({
              __typename: Kind
          } & Properties)
    ),
]

export interface ForcedSubject<T> {
    readonly __typename: T
}

export const TYPE_FIELD = '__typename' as const

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export function toRecord<T extends string, Properties extends Record<string, any>>(
    typeName: T,
    object: Properties,
): { __typename: T } & Properties {
    if (!Object.hasOwn(object, TYPE_FIELD)) {
        Object.defineProperty(object, '__typename', { value: typeName })
    }
    return object as Properties & ForcedSubject<T>
}

// this list determines the possible subject, types, and actions
// it also controls the types allowed by the Action#requireAbilityTo  method
// it does NOT control access itself, those rules are defined in the defineAbilityFor in permissions.ts
type Abilities =
    | Ability<'User', 'invite' | 'update' | 'view', { id?: UUID; orgId?: UUID; orgSlug?: string }>
    | Ability<'PendingUser', 'claim', object>
    | Ability<'TeamMembers', 'view', { orgSlug: string }>
    | Ability<'Study', 'view' | 'create' | 'review' | 'approve' | 'reject' | 'update' | 'delete', { orgId: UUID }>
    | Ability<'StudyJob', 'view' | 'create', { orgId: UUID }>
    | Ability<'ReviewerKey', 'view' | 'update', object>
    | Ability<'Team', 'view' | 'update' | 'create' | 'delete', { orgId?: UUID; orgSlug?: string }>
    | Ability<'TeamMembers', 'view', { orgId?: UUID; orgSlug?: string }>
    | Ability<'Org', 'view' | 'delete', { orgId?: UUID; orgSlug?: string }>
    | Ability<'Orgs', 'view', object>

export type PermissionsObjectSubjects = Extract<Abilities[1], object>

export type PermissionsActionSubjectMap = {
    [K in Abilities as K[0]]: Extract<K[1], string>
}

export type PermissionsSubjectToObjectMap = {
    [K in PermissionsObjectSubjects as K['__typename']]: Omit<K, '__typename'>
}

export type AppAbility = MongoAbility<Abilities>
