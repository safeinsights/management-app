import { z } from 'zod'
import { rulesetDraftFilesSchema } from '@/lib/semgrep-rulesets/schemas'
import { rulesetVersionSchema } from '../../services/semgrep-runner/protocol'

// Below the manifest's 2000, to leave room for the "Promoted from <env> <version>: " prefix.
export const PROMOTE_CHANGE_NOTE_MAX = 1900

export const createSemgrepRulesetDraftSchema = z.object({
    files: rulesetDraftFilesSchema,
    changeNote: z.string().min(1).max(2000),
})

export const requestSemgrepRulesetChangeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['publish', 'rollback']), version: rulesetVersionSchema }),
    z.object({
        kind: z.literal('promote'),
        upstreamVersion: rulesetVersionSchema,
        changeNote: z.string().max(PROMOTE_CHANGE_NOTE_MAX).optional(),
    }),
])
