import { describe, expect, it, beforeEach } from 'vitest'
import { db, mockSessionWithTestData } from '@/tests/unit.helpers'
import { writeClaudeContextAction, getClaudeContextAction } from './claude-context.actions'
import { errorToString, isActionError } from '@/lib/errors'

describe('context actions', () => {
    describe('writeClaudeContextAction', () => {
        beforeEach(async () => {
            await db.deleteFrom('claudeContext').execute()
        })
        it('denies non-siAdmin users', async () => {
            await mockSessionWithTestData({ isSiAdmin: false })
            const result = await writeClaudeContextAction({
                name: 'SYSTEM',
                orgId: null,
                content: 'error content',
            })
            expect(isActionError(result)).toBe(true)
            const row = await db
                .selectFrom('claudeContext')
                .select(['name', 'orgId', 'content'])
                .where('name', '=', 'SYSTEM')
                .executeTakeFirst()
            expect(row).toBeUndefined()
        })

        it('writes a new piece of context when user is admin', async () => {
            const { user } = await mockSessionWithTestData({ isSiAdmin: true })
            const result = await writeClaudeContextAction({
                name: 'SYSTEM',
                content: 'system context',
                orgId: null,
            })
            expect(isActionError(result)).toBe(false)
            const row = await db
                .selectFrom('claudeContext')
                .select(['name', 'orgId', 'content', 'updatedBy'])
                .where('name', '=', 'SYSTEM')
                .where('orgId', 'is', null)
                .executeTakeFirstOrThrow()
            expect(row.content).toBe('system context')
            expect(row.updatedBy).toBe(user.id)
        })

        it('updates row on conflict', async () => {
            const { user } = await mockSessionWithTestData({ isSiAdmin: true })
            await writeClaudeContextAction({
                name: 'PYTHON',
                content: 'starter python context',
                orgId: null,
            })
            const result = await writeClaudeContextAction({
                name: 'PYTHON',
                content: "new context that's new",
                orgId: null,
            })
            expect(isActionError(result)).toBe(false)
            const rows = await db
                .selectFrom('claudeContext')
                .select(['name', 'orgId', 'content', 'updatedBy'])
                .where('name', '=', 'PYTHON')
                .where('orgId', 'is', null)
                .execute()
            expect(rows).toHaveLength(1)
            expect(rows[0].content).toBe("new context that's new")
            expect(rows[0].updatedBy).toBe(user.id)
        })

        it('rejects unknown context names', async () => {
            await mockSessionWithTestData({ isSiAdmin: true })
            const result = await writeClaudeContextAction({
                // @ts-expect-error testing runtime validation
                name: 'BUSINESS',
                content: 'nope',
                orgId: null,
            })
            expect(isActionError(result)).toBe(true)
            expect(errorToString(result)).toMatch('Validation')
        })
    })
    describe('getClaudeContextAction', () => {
        it('denies non-admin users', async () => {
            await mockSessionWithTestData({ isSiAdmin: false })
            const result = await getClaudeContextAction({ name: 'SYSTEM', orgId: null })
            expect(isActionError(result)).toBe(true)
        })
        it('returns the requested context', async () => {
            await mockSessionWithTestData({ isSiAdmin: true })
            await writeClaudeContextAction({ name: 'PYTHON', content: 'py stuff', orgId: null })

            const result = await getClaudeContextAction({ name: 'PYTHON', orgId: null })

            expect(isActionError(result)).toBe(false)
            if (!isActionError(result)) expect(result.content).toBe('py stuff')
        })
        it("returns empty string when requested context doesn't exist", async () => {
            await mockSessionWithTestData({ isSiAdmin: true })
            // clear any existing content
            await db.deleteFrom('claudeContext').where('name', '=', 'PYTHON').where('orgId', 'is', null).execute()

            const result = await getClaudeContextAction({ name: 'PYTHON', orgId: null })
            expect(isActionError(result)).toBe(false)
            if (!isActionError(result)) expect(result.content).toBe('')
        })
    })
})
