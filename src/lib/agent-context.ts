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

export const getAgentContext = async (db: DBConn, { name, orgId }: { name: ContextName; orgId: string | null }) => {
    const row = await db
        .selectFrom('agentContext')
        .select('content')
        .where('name', '=', name)
        .where('orgId', orgId === null ? 'is' : '=', orgId)
        .executeTakeFirst()

    return { content: row?.content ?? '' }
}

// SYSTEM context followed by the language context, empties skipped.
export const getAgentContextString = async (
    db: DBConn,
    { language, orgId }: { language: Language; orgId: string | null },
): Promise<string> => {
    const names: ContextName[] = ['SYSTEM', language]
    const parts: string[] = []
    for (const name of names) {
        const { content } = await getAgentContext(db, { name, orgId })
        if (content) parts.push(content)
    }
    return parts.join('\n')
}
