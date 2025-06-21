import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import JobStatusDisplay from './job-status-display'
import dayjs from 'dayjs'

describe('JobStatusDisplay', () => {
    it('shows approved status for CODE-APPROVED', () => {
        const date = new Date('2024-03-03T00:00:00Z')
        renderWithProviders(<JobStatusDisplay status="CODE-APPROVED" date={date} />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for RESULTS-REJECTED', () => {
        const date = new Date('2024-04-04T00:00:00Z')
        renderWithProviders(<JobStatusDisplay status="RESULTS-REJECTED" date={date} />)

        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('renders nothing for disallowed status or missing date', () => {
        renderWithProviders(<JobStatusDisplay status="JOB-RUNNING" date={new Date()} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        renderWithProviders(<JobStatusDisplay status="CODE-APPROVED" date={null} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
