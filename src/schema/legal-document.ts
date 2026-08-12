import { z } from 'zod'

export const legalDocumentTypeSchema = z.enum(['TOS', 'PN', 'ROPA', 'DOPA', 'SLA'])

export type LegalDocumentTypeValue = z.infer<typeof legalDocumentTypeSchema>

export const legalDocumentTypeLabels: Record<LegalDocumentTypeValue, string> = {
    TOS: 'Terms of Service',
    PN: 'Privacy Notice',
    SLA: 'Study Level Agreement',
    // "Organization" is the wording on the executed documents themselves, so an admin matching a
    // signed PDF to a tab sees the same name twice. The app's own noun for the org is below.
    DOPA: 'Data Organization Participation Agreement',
    ROPA: 'Research Organization Participation Agreement',
}

// The types every user must acknowledge, in the order they are presented. Unlike ropa/dopa/sla these
// are global — one document each, no org or study scope — so the audience is simply everybody.
// Adding sla here also means retiring study.researcherAgreementsAckedAt / reviewerAgreementsAckedAt;
// two agreement gates on the same study would disagree.
export const enforcedLegalDocumentTypes = ['TOS', 'PN'] as const

export type EnforcedLegalDocumentType = (typeof enforcedLegalDocumentTypes)[number]

export const legalDocumentFormatSchema = z.enum(['markdown', 'pdf'])

export type LegalDocumentFormat = z.infer<typeof legalDocumentFormatSchema>

// Fixed per type rather than chosen per upload, so a document can never be stored in a format its
// viewer cannot render.
export const legalDocumentFormats: Record<LegalDocumentTypeValue, LegalDocumentFormat> = {
    TOS: 'markdown',
    PN: 'markdown',
    SLA: 'pdf',
    DOPA: 'pdf',
    ROPA: 'pdf',
}

// Only the two org-scoped types, and which kind of org each one is signed with.
export const participationAgreementOrgTypes = { DOPA: 'enclave', ROPA: 'lab' } as const

export type ParticipationAgreementType = keyof typeof participationAgreementOrgTypes

// Derived from the map above rather than restating its keys, so a third participation-agreement type
// is one edit.
export const participationAgreementTypeSchema = z.enum(
    Object.keys(participationAgreementOrgTypes) as [ParticipationAgreementType, ...ParticipationAgreementType[]],
)

// The app's own noun for the org each agreement is signed with, which is not the agreement's name.
export const participationAgreementOrgLabels: Record<ParticipationAgreementType, string> = {
    DOPA: 'Data Partner',
    ROPA: 'Research Lab',
}

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
        ctx.addIssue({ code: 'custom', path: ['studyId'], message: 'sla must belong to a study' })
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

// The shape check alone lets '2026-02-30' through to the `date` column, where it fails as a database
// error rather than a field error. Round-tripping rejects any day the calendar does not have.
const isRealCalendarDay = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// A day of slack, deliberately: this runs on a UTC clock while the admin's date input is local, so
// someone in a zone ahead of UTC records a genuine same-day signature on what is still tomorrow here.
// Wide enough for that, narrow enough to still catch a year typed as 2206. Comparing the strings
// works because YYYY-MM-DD sorts chronologically.
const latestSignableDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export const publishLegalDocumentVersionSchema = z.object({
    versionId: z.string(),
    // Kept a plain string so it never hits a timezone conversion on the way to a `date` column.
    signedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Signed date must be YYYY-MM-DD')
        .refine(isRealCalendarDay, 'Signed date is not a real calendar date')
        // Publishing cannot be undone, so a mistyped year has to be caught before it is on record.
        .refine((value) => value <= latestSignableDay(), 'Signed date cannot be in the future')
        .optional(),
})

export const acknowledgeLegalDocumentSchema = z.object({
    versionId: z.string(),
})

// Params for both participation reads — the agreements table and the signatory picker — so it is
// named for what it carries rather than for one of its callers.
export const participationAgreementTypeParams = z.object({
    type: participationAgreementTypeSchema,
})

export const fetchLegalDocumentAcknowledgementsSchema = z.object({
    type: legalDocumentTypeSchema,
    orgId: z.string().optional(),
    studyId: z.string().optional(),
    sort: z
        .object({
            columnAccessor: z.enum(['fullName', 'email', 'ackedAt']),
            direction: z.enum(['asc', 'desc']),
        })
        .optional(),
})

// The columns the audit table can sort by. Org and version are absent on purpose: a user can belong
// to several orgs, and a missing version is an absence rather than a value to order against.
export type LegalDocumentAcknowledgementSort = NonNullable<
    z.infer<typeof fetchLegalDocumentAcknowledgementsSchema>['sort']
>

// Query keys for the legal-document actions. Not beside the actions themselves — that is a server
// actions module, so every export there has to be an async function. Centralized because the
// version-history read was cached under two different roots, one per tab, so an upload invalidated
// one consumer and silently missed the other.
export const legalDocumentQueryKeys = {
    // The exact scope a reader asked for. tos/pn leave the scope columns undefined.
    versions: (scope: { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }) =>
        ['legalDocumentVersions', scope.type, scope.orgId, scope.studyId] as const,
    // Prefix of the above, so invalidating after a publish reaches every scope of that type without
    // the writer having to know which readers are mounted.
    versionsForType: (type: LegalDocumentTypeValue) => ['legalDocumentVersions', type] as const,
    // Sort is part of the key because the action orders the rows: the audience is assembled in
    // memory, so a re-sort is a new read rather than a client-side shuffle.
    acknowledgements: (type: LegalDocumentTypeValue, sort: LegalDocumentAcknowledgementSort) =>
        ['legalDocumentAcknowledgements', type, sort.columnAccessor, sort.direction] as const,
    participationAgreements: (type: ParticipationAgreementType) => ['participationAgreements', type] as const,
    participationSignatories: (type: ParticipationAgreementType) => ['participationSignatories', type] as const,
    studyLevelAgreements: () => ['studyLevelAgreements'] as const,
    studiesAwaitingSla: () => ['studiesAwaitingSla'] as const,
}
