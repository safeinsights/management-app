import { z } from 'zod'
import {
    distinctPaths,
    gateResponseSchema,
    hasRuleFile,
    rulesetFilePathSchema,
    rulesetPersonSchema,
    rulesetVersionSchema,
} from '../../../services/semgrep-runner/protocol'

export const RULESET_POINTER_FILE = 'published.json'
export const RULESET_CHANGE_KINDS = ['publish', 'rollback', 'promote'] as const

export const rulesetVersionNumber = (version: string) => Number(version.slice(1))

export const rulesetPointerSchema = z.object({
    schemaVersion: z.literal(1),
    version: rulesetVersionSchema,
    publishedAt: z.iso.datetime(),
    publishedBy: rulesetPersonSchema,
    kind: z.enum(RULESET_CHANGE_KINDS),
    previousVersion: rulesetVersionSchema.nullable(),
    requestId: z.uuid(),
})
export type RulesetPointer = z.infer<typeof rulesetPointerSchema>

export const rulesetDraftFilesSchema = z
    .array(z.object({ path: rulesetFilePathSchema, content: z.string() }))
    .min(1)
    .refine(distinctPaths, 'duplicate or conflicting paths')
    .refine((files) => hasRuleFile(files.map((file) => file.path)), 'no rule file')
export type RulesetDraftFile = z.infer<typeof rulesetDraftFilesSchema>[number]

export const RULESET_REQUEST_STATUSES = ['running', 'published', 'gate-failed', 'conflict', 'invalid', 'error'] as const

export const rulesetRequestSchema = z.object({
    requestId: z.uuid(),
    kind: z.enum(RULESET_CHANGE_KINDS),
    targetVersion: rulesetVersionSchema.nullable(),
    upstreamVersion: rulesetVersionSchema.nullable(),
    requestedBy: rulesetPersonSchema,
    requestedAt: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    status: z.enum(RULESET_REQUEST_STATUSES),
    reason: z.string().nullable(),
    gate: gateResponseSchema.nullable(),
})
export type RulesetRequest = z.infer<typeof rulesetRequestSchema>
