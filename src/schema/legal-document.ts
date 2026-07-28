import { z } from 'zod'

export const legalDocumentTypeSchema = z.enum(['tos', 'pn', 'ropa', 'dopa', 'sla'])

export type LegalDocumentTypeValue = z.infer<typeof legalDocumentTypeSchema>

export const legalDocumentFormatSchema = z.enum(['markdown', 'pdf'])

// ToS/PN are global, ROPA/DOPA belong to one org, and an SLA belongs to one study. The database
// enforces this too (legal_document_scope_matches_type); validating here as well means a bad scope
// comes back as a readable field error instead of an opaque constraint violation.
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

export const createLegalDocumentDraftSchema = scopeSchema
    .extend({
        fileName: z.string().trim().min(1, 'A file name is required'),
        format: legalDocumentFormatSchema,
    })
    .superRefine(refineScope)

export const publishLegalDocumentVersionSchema = z.object({
    versionId: z.string(),
    // The day a signatory signed outside the app. Kept as a plain 'YYYY-MM-DD' string rather than a
    // Date so it never passes through a timezone conversion on its way to a `date` column.
    signedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Signed date must be YYYY-MM-DD')
        .optional(),
})

export const acknowledgeLegalDocumentSchema = z.object({
    versionId: z.string(),
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
