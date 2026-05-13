'use server'

import { Action, ActionFailure } from './action'
import { z } from 'zod'
import { sql } from 'kysely'
import { CONTEXT_NAMES } from '@/lib/claude-context'

export const writeClaudeContextAction = new Action('writeClaudeContext', { performsMutations: true })
    .params(z.object({ content: z.string(), orgId: z.string().uuid().nullable(), name: z.enum(CONTEXT_NAMES)}))
    .handler(async ({ session, db, params: { name, content, orgId } }) => {
        if (!session?.user.isSiAdmin) {
            throw new ActionFailure({ permission_denied: 'Must be SafeInsights admin'})
        }
        const userId = session.user.id
        await db
            .insertInto('claudeContext')
            .values({
                name: name,
                content: content,
                orgId: orgId,
                updatedBy: userId
            })
            .onConflict((onconflict) => onconflict.columns(['orgId', 'name']).doUpdateSet({
                content: content,
                updatedBy: userId,
                updatedAt: sql`now()`
            }))
            .execute()

        return { success: true }
    })

export const getClaudeContextAction = new Action('getClaudeContext')
    .params(z.object({
        name: z.enum(CONTEXT_NAMES),
        orgId: z.string().uuid().nullable()
    }))
    .handler(async ({ session, db, params: { name, orgId }}) => {
        if (!session?.user.isSiAdmin) {
            throw new ActionFailure({ permission_denied: 'Must be SafeInsights admin'})
        }
        const row = await db
            .selectFrom('claudeContext')
            .select('content')
            .where('name', '=', name)
            .where('orgId', orgId === null ? 'is' : '=', orgId)
            .executeTakeFirst()

        return { content: row?.content ?? ''}
    })
