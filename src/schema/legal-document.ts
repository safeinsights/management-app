import { z } from 'zod'
import type { LegalDocumentFormat, LegalDocumentType, OrgType } from '@/database/types'

// Restate enum (but enforce parity with DB) for zod validation
const legalDocumentTypeValues = ['TOS', 'PN', 'ROPA', 'DOPA', 'SLA'] as const satisfies readonly LegalDocumentType[]

export const legalDocumentTypeSchema = z.enum(legalDocumentTypeValues)

export const legalDocumentTypeLabels: Record<LegalDocumentType, string> = {
    TOS: 'Terms of Service',
    PN: 'Privacy Notice',
    SLA: 'Study Agreement',
    // "Organization" matches the wording on the executed documents, not the app's own noun for orgs.
    DOPA: 'Data Organization Participation Agreement',
    ROPA: 'Research Organization Participation Agreement',
}

// Tabs, panel headings and empty states name a collection of documents; the modals and the admin
// screens name one. The three agreement types pluralise with a bare 's'; tos/pn are already collective.
export const legalDocumentCollectionLabels: Record<LegalDocumentType, string> = {
    TOS: legalDocumentTypeLabels.TOS,
    PN: legalDocumentTypeLabels.PN,
    SLA: `${legalDocumentTypeLabels.SLA}s`,
    DOPA: `${legalDocumentTypeLabels.DOPA}s`,
    ROPA: `${legalDocumentTypeLabels.ROPA}s`,
}

// List of documents whos acknowledgments are currently required.
export const enforcedLegalDocumentTypes = ['TOS', 'PN', 'ROPA', 'DOPA'] as const
export type EnforcedLegalDocumentType = (typeof enforcedLegalDocumentTypes)[number]

// ONLY tos/pn are global documents. It's important not to conflate these two with other types
// because they are less gated/more visible permissions wise.
export const globalLegalDocumentTypes = ['TOS', 'PN'] as const
export type GlobalLegalDocumentType = (typeof globalLegalDocumentTypes)[number]

// How a resolved document renders: markdown is inlined, a pdf is a signed-url link. A tagged union,
// not two optional fields, so exactly one payload is representable.
export type LegalDocumentBody = { format: 'markdown'; content: string } | { format: 'pdf'; url: string }

// A published document with its body resolved. Scope-neutral instead of `global` or `enforced`
export type ResolvedLegalDocument = {
    type: LegalDocumentType
    versionId: string
} & LegalDocumentBody

// The tos/pn shown at signup, readable without a session.
export type GlobalLegalDocument = ResolvedLegalDocument & { type: GlobalLegalDocumentType }

// What the app-wide gate is blocking on — keyed off *enforced*, not global/public (ropa/dopa are
// enforced but never public).
export type PendingLegalDocument = ResolvedLegalDocument & {
    type: EnforcedLegalDocumentType
    /** True if the user acknowledged an earlier version, false if never. */
    isUpdate: boolean
    /** The org an org-scoped ropa/dopa binds, for the copy to name; null for global tos/pn. */
    orgName: string | null
}

// `satisfies` enforces parity with the DB enum.
const legalDocumentFormatValues = ['markdown', 'pdf'] as const satisfies readonly LegalDocumentFormat[]

export const legalDocumentFormatSchema = z.enum(legalDocumentFormatValues)

// Fixed per type rather than chosen per upload, so a document can never be stored in a format its
// viewer cannot render.
export const legalDocumentFormats: Record<LegalDocumentType, LegalDocumentFormat> = {
    TOS: 'markdown',
    PN: 'markdown',
    SLA: 'pdf',
    DOPA: 'pdf',
    ROPA: 'pdf',
}

export const participationAgreementOrgTypes = { DOPA: 'enclave', ROPA: 'lab' } as const

export type ParticipationAgreementType = keyof typeof participationAgreementOrgTypes

export const participationAgreementTypeSchema = z.enum(
    Object.keys(participationAgreementOrgTypes) as [ParticipationAgreementType, ...ParticipationAgreementType[]],
)

export const participationAgreementOrgLabels: Record<ParticipationAgreementType, string> = {
    DOPA: 'Data Partner',
    ROPA: 'Research Lab',
}

// A Record rather than a ternary so a new OrgType is a type error instead of falling through to ROPA.
export const participationAgreementTypeForOrgType: Record<OrgType, ParticipationAgreementType> = {
    enclave: 'DOPA',
    lab: 'ROPA',
}

export const studyAgreementCounterpartyLabels: Record<OrgType, string> = {
    enclave: 'From',
    lab: 'To',
}

// Shared because `??` and `||` differ on an empty-string title, enough to make a sort disagree
// with what it displays.
export const studyAgreementDisplayTitle = (row: { studyTitle: string | null; studyId: string }) =>
    row.studyTitle || row.studyId

// Mirrors the DB's scope check so a bad scope returns a field error, not a constraint violation.
const scopeSchema = z.object({
    type: legalDocumentTypeSchema,
    orgId: z.string().optional(),
    studyId: z.string().optional(),
})

const refineScope = ({ type, orgId, studyId }: z.infer<typeof scopeSchema>, ctx: z.RefinementCtx) => {
    const requiresOrg = type === 'ROPA' || type === 'DOPA'
    const requiresStudy = type === 'SLA'

    if (requiresOrg && !orgId) {
        ctx.addIssue({ code: 'custom', path: ['orgId'], message: `${type} must belong to an organization` })
    }
    if (requiresStudy && !studyId) {
        ctx.addIssue({ code: 'custom', path: ['studyId'], message: 'study agreement must belong to a study' })
    }
    if (!requiresOrg && orgId) {
        ctx.addIssue({ code: 'custom', path: ['orgId'], message: `${type} cannot be scoped to an organization` })
    }
    if (!requiresStudy && studyId) {
        ctx.addIssue({ code: 'custom', path: ['studyId'], message: `${type} cannot be scoped to a study` })
    }
}

export const legalDocumentScopeSchema = scopeSchema.superRefine(refineScope)

// No `format`: it is derived from `type` server-side via legalDocumentFormats.
export const createLegalDocumentDraftSchema = scopeSchema
    .extend({
        fileName: z.string().trim().min(1, 'A file name is required'),
    })
    .superRefine(refineScope)

// The regex alone lets '2026-02-30' reach the `date` column, where it fails as a database error
// rather than a field error.
const isRealCalendarDay = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// A day of slack, deliberately: this runs on a UTC clock while the admin's date input is local, so
// a zone ahead of UTC signs same-day on what is still tomorrow here.
const latestSignableDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export const publishLegalDocumentVersionSchema = z.object({
    versionId: z.string(),
    // A plain string so it never hits a timezone conversion on the way to a `date` column.
    signedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Signed date must be YYYY-MM-DD')
        .refine(isRealCalendarDay, 'Signed date is not a real calendar date')
        .refine((value) => value <= latestSignableDay(), 'Signed date cannot be in the future')
        .optional(),
})

export const acknowledgeLegalDocumentSchema = z.object({
    // A uuid because scopeFromVersionId queries on it before any handler runs, so a malformed id
    // would 500 there rather than failing closed.
    versionId: z.string().uuid(),
})

export const studyAgreementStatusSchema = z.object({
    // As above: scopeFromStudyId queries on this before the handler runs.
    studyId: z.string().uuid(),
})

// One shape for both the blocking modal and the "being prepared" notice, so they cannot disagree.
export type StudyAgreementStatus =
    | { state: 'none' }
    | { state: 'pending'; versionId: string; downloadUrl: string }
    | { state: 'acknowledged' }

export const orgLegalParams = z.object({
    orgSlug: z.string().min(1, 'An organization is required'),
})

const sortDirection = z.enum(['asc', 'desc'])

// One enum per table rather than a shared union: an accessor a query does not select would
// otherwise reach its ORDER BY and throw.
export const orgStudyAgreementSort = z.object({
    columnAccessor: z.enum(['studyId', 'studyTitle', 'signedAt']),
    direction: sortDirection,
})

export const userStudyAgreementSort = z.object({
    columnAccessor: z.enum(['studyId', 'studyTitle', 'signedAt', 'ackedAt']),
    direction: sortDirection,
})

export const userParticipationAgreementSort = z.object({
    columnAccessor: z.enum(['orgName', 'signedAt', 'ackedAt']),
    direction: sortDirection,
})

export type OrgStudyAgreementSort = z.infer<typeof orgStudyAgreementSort>
export type UserStudyAgreementSort = z.infer<typeof userStudyAgreementSort>
export type UserParticipationAgreementSort = z.infer<typeof userParticipationAgreementSort>

export const orgStudyAgreementParams = orgLegalParams.extend({ sort: orgStudyAgreementSort })
export const userStudyAgreementParams = z.object({ sort: userStudyAgreementSort })

export const inviteParams = z.object({
    inviteId: z.uuid(),
})

export const participationAgreementTypeParams = z.object({
    type: participationAgreementTypeSchema,
})

export const userParticipationAgreementParams = participationAgreementTypeParams.extend({
    sort: userParticipationAgreementSort,
})

export const globalDocumentTypeParams = z.object({
    type: z.enum(globalLegalDocumentTypes),
})

export const fetchLegalDocumentAcknowledgementsSchema = z.object({
    type: z.enum(globalLegalDocumentTypes),
    orgId: z.string().optional(),
    studyId: z.string().optional(),
    sort: z
        .object({
            columnAccessor: z.enum(['fullName', 'email', 'ackedAt', 'lastLoginAt']),
            direction: z.enum(['asc', 'desc']),
        })
        .optional(),
})

export type LegalDocumentAcknowledgementSort = NonNullable<
    z.infer<typeof fetchLegalDocumentAcknowledgementsSchema>['sort']
>

// Not beside the actions because a server actions module may only export async functions.
export const legalDocumentQueryKeys = {
    versions: (scope: { type: LegalDocumentType; orgId?: string; studyId?: string }) =>
        ['legalDocumentVersions', scope.type, scope.orgId, scope.studyId] as const,
    // A prefix of the above, so invalidating after a publish reaches every scope of that type.
    versionsForType: (type: LegalDocumentType) => ['legalDocumentVersions', type] as const,
    nextPendingAcknowledgement: () => ['nextPendingLegalAcknowledgement'] as const,
    // Read by the signup form before an account exists, so there is no session to key it by.
    globalDocuments: () => ['globalLegalDocuments'] as const,
    // Keyed by invite id, the only thing the signup form has to key it by.
    participationAgreementForInvite: (inviteId: string) => ['participationAgreement', inviteId] as const,
    // Keyed by version, not the presigned URL: that is re-minted per read, so it never cache-hits.
    documentContent: (versionId: string) => ['legalDocumentContent', versionId] as const,
    // Sort is part of the key because the action orders the rows, so a re-sort is a new read.
    acknowledgements: (type: LegalDocumentType, sort: LegalDocumentAcknowledgementSort) =>
        ['legalDocumentAcknowledgements', type, sort.columnAccessor, sort.direction] as const,
    participationAgreements: (type: ParticipationAgreementType) => ['participationAgreements', type] as const,
    participationSignatories: (type: ParticipationAgreementType) => ['participationSignatories', type] as const,
    studyAgreements: () => ['studyAgreements'] as const,
    studiesAwaitingStudyAgreement: () => ['studiesAwaitingStudyAgreement'] as const,
    // Shared by the layout's gate and the proposal step's notice, so one request answers both.
    studyAgreement: (studyId: string) => ['studyAgreement', studyId] as const,
    orgStudyAgreements: (orgSlug: string, sort: OrgStudyAgreementSort) =>
        ['orgStudyAgreements', orgSlug, sort.columnAccessor, sort.direction] as const,
    orgParticipationAgreement: (orgSlug: string) => ['orgParticipationAgreement', orgSlug] as const,
    userStudyAgreements: (sort: UserStudyAgreementSort) =>
        ['userStudyAgreements', sort.columnAccessor, sort.direction] as const,
    userParticipationAgreements: (type: ParticipationAgreementType, sort: UserParticipationAgreementSort) =>
        ['userParticipationAgreements', type, sort.columnAccessor, sort.direction] as const,
    userGlobalDocument: (type: GlobalLegalDocumentType) => ['userGlobalDocument', type] as const,
}
