import { auditQaInvocation } from '@/app/api/qa/audit'
import { localStorageContext } from '@/server/request-context'
import { db, describe, expect, getAuditEntriesWithMetadata, it, mockSessionWithTestData } from '@/tests/unit.helpers'

describe('auditQaInvocation', () => {
    it('refuses to write inside a transaction, since the row must survive a rollback', async () => {
        const { user } = await mockSessionWithTestData()
        await expect(
            db.transaction().execute((trx) =>
                localStorageContext.run({ db: trx }, () =>
                    auditQaInvocation({
                        actorUserId: user.id,
                        eventType: 'DELETED',
                        recordType: 'USER',
                        recordId: user.id,
                        outcome: 'attempted',
                    }),
                ),
            ),
        ).rejects.toThrow('QA audit rows must be written outside any transaction')
    })

    it('writes the audit row outside a transaction', async () => {
        const { user } = await mockSessionWithTestData()
        await auditQaInvocation({
            actorUserId: user.id,
            eventType: 'DELETED',
            recordType: 'USER',
            recordId: user.id,
            outcome: 'attempted',
        })

        const entries = await getAuditEntriesWithMetadata(user.id, 'USER')
        expect(entries).toEqual([
            expect.objectContaining({
                eventType: 'DELETED',
                userId: user.id,
                metadata: expect.objectContaining({ outcome: 'attempted', via: 'qa-api' }),
            }),
        ])
    })
})
