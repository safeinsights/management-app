import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import JobStatusDisplay from './job-status-display'
import dayjs from 'dayjs'

describe('JobStatusDisplay', () => {
    it('shows approved status for CODE-APPROVED', () => {
        const createdAt = new Date('2024-03-03T00:00:00Z')
        renderWithProviders(<JobStatusDisplay statusChange={{ status: 'CODE-APPROVED', createdAt }} />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for FILES-REJECTED', () => {
        const createdAt = new Date('2024-04-04T00:00:00Z')
        renderWithProviders(<JobStatusDisplay statusChange={{ status: 'CODE-REJECTED', createdAt }} />)
        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('renders nothing for disallowed status or missing date', () => {
        renderWithProviders(<JobStatusDisplay statusChange={{ status: 'JOB-RUNNING', createdAt: new Date() }} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        renderWithProviders(<JobStatusDisplay statusChange={{ status: 'INITIATED', createdAt: new Date() }} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
