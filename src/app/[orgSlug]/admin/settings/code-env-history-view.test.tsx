import dayjs from 'dayjs'
import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { DATE_TIME_FORMAT } from '@/lib/dates'
import { CodeEnvHistoryTable } from './code-env-history-view'

describe('CodeEnvHistoryTable', () => {
    it('dates each change in the app format, not the browser locale', () => {
        const createdAt = new Date('2026-09-24T01:30:00Z')
        renderWithProviders(
            <CodeEnvHistoryTable
                isVisible
                entries={[
                    {
                        id: 'e1',
                        createdAt,
                        eventType: 'CREATED',
                        userFullName: 'Ada Lovelace',
                        metadata: { changes: [] },
                    },
                ]}
            />,
        )

        expect(screen.getByText(dayjs(createdAt).format(DATE_TIME_FORMAT))).toBeInTheDocument()
    })
})
