'use server'

import { Action } from './action'
import { z } from 'zod'
import { sql } from 'kysely'
import { CONTEXT_NAMES, getClaudeContext } from '@/lib/claude-context'

export const writeClaudeContextAction = new Action('writeClaudeContextAction', { performsMutations: true })
    .params(z.object({ content: z.string(), orgId: z.string().uuid().nullable(), name: z.enum(CONTEXT_NAMES) }))
    .requireAbilityTo('update', 'ClaudeContext')
    .handler(async ({ session, db, params: { name, content, orgId } }) => {
        const userId = session.user.id
        await db
            .insertInto('claudeContext')
            .values({
                name: name,
                content: content,
                orgId: orgId,
                updatedBy: userId,
            })
            .onConflict((onconflict) =>
                onconflict.columns(['orgId', 'name']).doUpdateSet({
                    content: content,
                    updatedBy: userId,
                    updatedAt: sql`now()`,
                }),
            )
            .execute()
    })

export const getClaudeContextAction = new Action('getClaudeContextAction')
    .params(
        z.object({
            name: z.enum(CONTEXT_NAMES),
            orgId: z.string().uuid().nullable(),
        }),
    )
    .requireAbilityTo('view', 'ClaudeContext')
    .handler(async ({ db, params: { name, orgId } }) => {
        return await getClaudeContext(db, { name, orgId })
    })
