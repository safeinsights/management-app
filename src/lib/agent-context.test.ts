import { describe, expect, it, beforeEach } from 'vitest'
import { db, insertTestOrg } from '@/tests/unit.helpers'
import { getAgentContextString } from './agent-context'

describe('getAgentContextString', () => {
    beforeEach(async () => {
        await db.deleteFrom('agentContext').execute()
    })

    it('concatenates SYSTEM then the language context, skipping empties', async () => {
        await db
            .insertInto('agentContext')
            .values([
                { name: 'SYSTEM', orgId: null, content: 'system guidance' },
                { name: 'PYTHON', orgId: null, content: 'python guidance' },
            ])
            .execute()

        const result = await getAgentContextString(db, { language: 'PYTHON', orgId: null })

        expect(result).toBe('system guidance\npython guidance')
    })

    it('returns only the present context when one is missing', async () => {
        await db.insertInto('agentContext').values({ name: 'SYSTEM', orgId: null, content: 'only system' }).execute()

        const result = await getAgentContextString(db, { language: 'R', orgId: null })

        expect(result).toBe('only system')
    })

    it('ignores the other language context', async () => {
        await db
            .insertInto('agentContext')
            .values([
                { name: 'R', orgId: null, content: 'r guidance' },
                { name: 'PYTHON', orgId: null, content: 'python guidance' },
            ])
            .execute()

        const result = await getAgentContextString(db, { language: 'R', orgId: null })

        expect(result).toBe('r guidance')
    })

    it('skips a context whose content is empty', async () => {
        await db
            .insertInto('agentContext')
            .values([
                { name: 'SYSTEM', orgId: null, content: '' },
                { name: 'R', orgId: null, content: 'r guidance' },
            ])
            .execute()

        const result = await getAgentContextString(db, { language: 'R', orgId: null })

        expect(result).toBe('r guidance')
    })

    it('keeps org-scoped and global contexts apart', async () => {
        const org = await insertTestOrg()
        await db
            .insertInto('agentContext')
            .values([
                { name: 'SYSTEM', orgId: null, content: 'global system' },
                { name: 'SYSTEM', orgId: org.id, content: 'org system' },
                { name: 'R', orgId: org.id, content: 'org r' },
            ])
            .execute()

        expect(await getAgentContextString(db, { language: 'R', orgId: null })).toBe('global system')
        expect(await getAgentContextString(db, { language: 'R', orgId: org.id })).toBe('org system\norg r')
    })

    it('returns an empty string when no context is configured', async () => {
        const result = await getAgentContextString(db, { language: 'R', orgId: null })

        expect(result).toBe('')
    })
})
