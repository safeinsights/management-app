import { MongoAbility } from '@casl/ability'
import { UUID } from './types'
import { ContextName } from './agent-context'
import type { StudyStatus } from '@/database/types'

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

// Declares the possible subjects and actions; it does NOT control access, which is defined by
// defineAbilityFor in permissions.ts.
type Abilities =
    // 'manage'/'all' are CASL's wildcard tokens, not real domain actions/subjects.
    | Ability<'all', 'manage', object>
    // 'manageRole' is separate from 'update' so the self-profile rule cannot authorize a role
    // change and let a member promote themselves to org admin (OTTER-720).
    | Ability<'User', 'invite' | 'update' | 'view' | 'manageRole', { id?: UUID; orgId?: UUID; orgSlug?: string }>
    // `orgId` appears on both arms so the CASL subject union accepts an orgId condition on
    // 'revoke'; it stays optional because 'claim' is unconditioned.
    | Ability<'PendingUser', 'claim', { orgId?: UUID; inviteId?: string }>
    | Ability<'PendingUser', 'revoke', { orgId?: UUID; inviteId?: string }>
    | Ability<'OrgMembers', 'view', { orgId: UUID }>
    | Ability<'Studies', 'view', object>
    | Ability<'OrgStudies', 'view', { orgType: 'enclave' | 'lab'; orgId?: UUID; submittedByOrgId?: UUID }>
    | Ability<'Study', 'view' | 'create', { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }>
    | Ability<
          'Study',
          'review' | 'approve' | 'reject' | 'update' | 'delete',
          // `status` is unused here but must appear on every 'Study' arm so the CASL subject
          // union accepts a `status` condition on the view rule.
          { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }
      >
    | Ability<'StudyJob', 'view' | 'create', { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }>
    | Ability<'UserKey', 'view' | 'update', object>
    | Ability<'Org', 'view' | 'update' | 'create' | 'delete', { orgId?: UUID; orgSlug?: string }>
    // Split out from 'Org' because `view Org` must stay cross-org for the public catalog, while
    // configuration reads carry secrets and belong to that org's admins only (OTTER-724 / MA-6).
    | Ability<'OrgConfig', 'view', { orgId?: UUID; orgSlug?: string }>
    | Ability<'OrgMembers', 'view', { orgId?: UUID; orgSlug?: string }>
    | Ability<'Orgs', 'view', object>
    | Ability<'MFA', 'reset', object>
    // orgId/studyId carry the DOCUMENT's scope. isGlobal and audienceOrgIds are derived per
    // request by middleware and answer the only question 'acknowledge' asks: who does it bind?
    | Ability<
          'LegalDocument',
          'view' | 'create' | 'publish' | 'acknowledge',
          { orgId?: UUID; studyId?: UUID; isGlobal?: boolean; audienceOrgIds?: UUID[] }
      >
    // orgId here is the VIEWING org, not the document's scope. Separate from LegalDocument's
    // 'view' because widening that verb would expose unpublished drafts and version history.
    | Ability<'OrgLegalDocuments', 'view', { orgId?: UUID }>
    // Both optional: `load IDE` is granted by two OR-combined rules (OTTER-719), and every field
    // used in a condition must appear on the arm.
    | Ability<'IDE', 'load', { researcherId?: UUID; submittedByOrgId?: UUID }>
    | Ability<
          'AgentContext',
          'create' | 'update' | 'view',
          { name: ContextName; orgId: string | null; content?: string }
      >

export type PermissionsObjectSubjects = Extract<Abilities[1], object>

export type PermissionsActionSubjectMap = {
    [K in Abilities as K[0]]: Extract<K[1], string>
}

export type PermissionsSubjectToObjectMap = {
    [K in PermissionsObjectSubjects as K['__typename']]: Omit<K, '__typename'>
}

export type AppAbility = MongoAbility<Abilities>
