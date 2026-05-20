import type { Language } from '@/database/types'
import { DBConn } from '@/database'

export type ContextName = 'SYSTEM' | Language
export const CONTEXT_NAMES = ['SYSTEM', 'R', 'PYTHON'] as const satisfies readonly ContextName[]

type _MissingContextNames = Exclude<ContextName, (typeof CONTEXT_NAMES)[number]>
const _contextNamesExhaustive: [_MissingContextNames] extends [never] ? true : _MissingContextNames = true
void _contextNamesExhaustive

type ContextInfo = {
    label: string
    description: string
}

export const CONTEXT_LABELS: Record<ContextName, ContextInfo> = {
    SYSTEM: { label: 'System context', description: 'Context about how SafeInsights works' },
    R: { label: 'R context', description: 'Context about using the R programming language' },
    PYTHON: { label: 'Python context', description: 'Context about using the Python programming language' },
}

export const getClaudeContext = async (db: DBConn, { name, orgId }: { name: ContextName; orgId: string | null }) => {
    const row = await db
        .selectFrom('claudeContext')
        .select('content')
        .where('name', '=', name)
        .where('orgId', orgId === null ? 'is' : '=', orgId)
        .executeTakeFirst()

    return { content: row?.content ?? '' }
}
