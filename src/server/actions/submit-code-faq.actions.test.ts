import { db, describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'
import { markSubmitCodeFaqSeenAction } from './submit-code-faq.actions'

describe('markSubmitCodeFaqSeenAction', () => {
    it('records a VIEWED event against the caller', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await markSubmitCodeFaqSeenAction()

        const rows = await db
            .selectFrom('audit')
            .select(['eventType', 'recordType', 'recordId', 'metadata'])
            .where('recordId', '=', user.id)
            .where('eventType', '=', 'VIEWED')
            .execute()

        expect(rows).toEqual([
            {
                eventType: 'VIEWED',
                recordType: 'USER',
                recordId: user.id,
                metadata: { subject: 'SUBMIT_CODE_FAQ' },
            },
        ])
    })
})
