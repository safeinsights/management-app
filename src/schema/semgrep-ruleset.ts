import { z } from 'zod'
import { rulesetDraftFilesSchema } from '@/lib/semgrep-rulesets/schemas'
import { scratchFileSchema } from '@/lib/semgrep-rulesets/test-run'
import { RULESET_TESTS_DIR, rulesetVersionSchema } from '../../services/semgrep-runner/protocol'

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

export const semgrepRulesetVersionSchema = z.object({ version: rulesetVersionSchema })

export const semgrepRulesetRequestSchema = z.object({ requestId: z.uuid() })

export const runSemgrepRulesTestSchema = z
    .object({ files: rulesetDraftFilesSchema, scratchFiles: z.array(scratchFileSchema).max(20) })
    .refine(
        ({ files, scratchFiles }) =>
            scratchFiles.length > 0 || files.some((file) => file.path.startsWith(`${RULESET_TESTS_DIR}/`)),
        'nothing to scan: add a test file or a fixture',
    )
    .refine(
        ({ scratchFiles }) => new Set(scratchFiles.map((file) => file.name)).size === scratchFiles.length,
        'duplicate test file names',
    )
