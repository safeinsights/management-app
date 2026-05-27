'use server'

import { Action } from './action'
import { z } from 'zod'
import { sql } from 'kysely'
import { CONTEXT_NAMES, getAgentContext } from '@/lib/agent-context'

export const writeAgentContextAction = new Action('writeAgentContextAction', { performsMutations: true })
    .params(z.object({ content: z.string(), orgId: z.string().uuid().nullable(), name: z.enum(CONTEXT_NAMES) }))
    .requireAbilityTo('update', 'AgentContext')
    .handler(async ({ session, db, params: { name, content, orgId } }) => {
        const userId = session.user.id
        await db
            .insertInto('agentContext')
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

export const getAgentContextAction = new Action('getAgentContextAction')
    .params(
        z.object({
            name: z.enum(CONTEXT_NAMES),
            orgId: z.string().uuid().nullable(),
        }),
    )
    .requireAbilityTo('view', 'AgentContext')
    .handler(async ({ db, params: { name, orgId } }) => {
        return await getAgentContext(db, { name, orgId })
    })
