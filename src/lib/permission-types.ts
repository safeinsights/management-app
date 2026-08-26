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

// this list determines the possible subject, types, and actions
// it also controls the types allowed by the Action#requireAbilityTo  method
// it does NOT control access itself, those rules are defined in the defineAbilityFor in permissions.ts
type Abilities =
    // CASL wildcard: ('manage','all') matches every action on every subject at runtime.
    // Reserved for SI admins (see defineAbilityFor). 'manage' and 'all' are CASL's built-in
    // wildcard tokens, not real domain actions/subjects.
    | Ability<'all', 'manage', object>
    // 'manageRole' is deliberately separate from 'update': the self-profile rule
    // (`update User` where id === session.user.id) must never be able to authorize a role
    // change, or any member could promote themselves to org admin (OTTER-720).
    | Ability<'User', 'invite' | 'update' | 'view' | 'manageRole', { id?: UUID; orgId?: UUID; orgSlug?: string }>
    // `orgId` appears on both arms so the CASL subject union accepts an orgId condition on the
    // 'revoke' rule (same reason the 'Study' arms all repeat `status`). It stays optional because
    // 'claim' is unconditioned and its action supplies only an inviteId.
    | Ability<'PendingUser', 'claim', { orgId?: UUID; inviteId?: string }>
    | Ability<'PendingUser', 'revoke', { orgId?: UUID; inviteId?: string }>
    | Ability<'OrgMembers', 'view', { orgId: UUID }>
    | Ability<'Studies', 'view', object>
    | Ability<'OrgStudies', 'view', { orgType: 'enclave' | 'lab'; orgId?: UUID; submittedByOrgId?: UUID }>
    | Ability<'Study', 'view' | 'create', { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }>
    | Ability<
          'Study',
          'review' | 'approve' | 'reject' | 'update' | 'delete',
          // `status` is unused by these actions but must appear in every 'Study' ability arm so the
          // CASL MongoQuery/subject union accepts a `status` condition on the view rule.
          { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }
      >
    | Ability<'StudyJob', 'view' | 'create', { orgId?: UUID; submittedByOrgId?: UUID; status?: StudyStatus }>
    // Renamed from 'ReviewerKey' — every user holds this key now, not just reviewers, so the old
    // name was misleading. Route + UI copy: /user-key (Routes.userKey), "Security key".
    | Ability<'UserKey', 'view' | 'update', object>
    | Ability<'Org', 'view' | 'update' | 'create' | 'delete', { orgId?: UUID; orgSlug?: string }>
    // Split out from 'Org' because `view Org` must stay cross-org for the public catalog (a lab
    // researcher picks datasets from an enclave they don't belong to). Configuration reads —
    // code-env settings, starter code — carry secrets and belong to that org's admins only
    // (OTTER-724 / MA-6).
    | Ability<'OrgConfig', 'view', { orgId?: UUID; orgSlug?: string }>
    | Ability<'OrgMembers', 'view', { orgId?: UUID; orgSlug?: string }>
    | Ability<'Orgs', 'view', object>
    | Ability<'MFA', 'reset', object>
    // orgId/studyId carry the DOCUMENT's scope. view/create/publish are SI-admin only, via
    // ('manage','all'). isGlobal and audienceOrgIds are derived per request by the actions'
    // middleware and answer the only question 'acknowledge' asks: who does this document bind? Both
    // must appear on the arm for the CASL subject union to accept them as conditions.
    | Ability<
          'LegalDocument',
          'view' | 'create' | 'publish' | 'acknowledge',
          { orgId?: UUID; studyId?: UUID; isGlobal?: boolean; audienceOrgIds?: UUID[] }
      >
    // orgId here is the VIEWING org, not the document's scope. Separate from LegalDocument's own
    // 'view' because view-gated actions take their scope from client params, so widening that verb
    // would also expose unpublished drafts and version history.
    | Ability<'OrgLegalDocuments', 'view', { orgId?: UUID }>
    // Both fields optional: `load IDE` is granted by two OR-combined rules — the study's own
    // researcher (researcherId) and any member of the submitting lab (submittedByOrgId, OTTER-719).
    // Every field used in a condition must appear on the arm for the CASL subject union to accept it.
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
