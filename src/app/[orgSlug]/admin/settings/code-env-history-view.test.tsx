import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
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

        // Tests run in America/Chicago.
        expect(screen.getByText('Sep 23, 2026, 08:30 pm')).toBeInTheDocument()
    })
})
