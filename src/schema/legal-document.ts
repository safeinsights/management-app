import { z } from 'zod'

export const legalDocumentTypeSchema = z.enum(['tos', 'pn', 'ropa', 'dopa', 'sla'])

export type LegalDocumentTypeValue = z.infer<typeof legalDocumentTypeSchema>

export const legalDocumentTypeLabels: Record<LegalDocumentTypeValue, string> = {
    tos: 'Terms of Service',
    pn: 'Privacy Notice',
    sla: 'Study Level Agreement',
    // "Organization" is the wording on the executed documents themselves, so an admin matching a
    // signed PDF to a tab sees the same name twice. The app's own noun for the org is below.
    dopa: 'Data Organization Participation Agreement',
    ropa: 'Research Organization Participation Agreement',
}

// The types every user must acknowledge, in the order they are presented. Unlike ropa/dopa/sla these
// are global — one document each, no org or study scope — so the audience is simply everybody.
export const enforcedLegalDocumentTypes = ['tos', 'pn'] as const

export type EnforcedLegalDocumentType = (typeof enforcedLegalDocumentTypes)[number]

export const legalDocumentFormatSchema = z.enum(['markdown', 'pdf'])

export type LegalDocumentFormat = z.infer<typeof legalDocumentFormatSchema>

// Fixed per type rather than chosen per upload, so a document can never be stored in a format its
// viewer cannot render.
export const legalDocumentFormats: Record<LegalDocumentTypeValue, LegalDocumentFormat> = {
    tos: 'markdown',
    pn: 'markdown',
    sla: 'pdf',
    dopa: 'pdf',
    ropa: 'pdf',
}

// Only the two org-scoped types, and which kind of org each one is signed with.
export const participationAgreementOrgTypes = { dopa: 'enclave', ropa: 'lab' } as const

export type ParticipationAgreementType = keyof typeof participationAgreementOrgTypes

export const participationAgreementTypeSchema = z.enum(['dopa', 'ropa'])

// The app's own noun for the org each agreement is signed with, which is not the agreement's name.
export const participationAgreementOrgLabels: Record<ParticipationAgreementType, string> = {
    dopa: 'Data Partner',
    ropa: 'Research Lab',
}

// Mirrors the DB's scope check so a bad scope returns a field error, not a constraint violation.
const scopeSchema = z.object({
    type: legalDocumentTypeSchema,
    orgId: z.string().optional(),
    studyId: z.string().optional(),
})

const refineScope = ({ type, orgId, studyId }: z.infer<typeof scopeSchema>, ctx: z.RefinementCtx) => {
    const requiresOrg = type === 'ropa' || type === 'dopa'
    const requiresStudy = type === 'sla'

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

export const publishLegalDocumentVersionSchema = z.object({
    versionId: z.string(),
    // Kept a plain string so it never hits a timezone conversion on the way to a `date` column.
    signedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Signed date must be YYYY-MM-DD')
        .optional(),
})

export const acknowledgeLegalDocumentSchema = z.object({
    versionId: z.string(),
})

export const fetchParticipationAgreementsSchema = z.object({
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
