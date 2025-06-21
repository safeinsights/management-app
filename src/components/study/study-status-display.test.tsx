import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import StudyStatusDisplay from './study-status-display'
import dayjs from 'dayjs'

describe('StudyStatusDisplay', () => {
    it('shows approved date when status is APPROVED', () => {
        const date = new Date('2024-01-01T00:00:00Z')
        renderWithProviders(<StudyStatusDisplay status="APPROVED" date={date} />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected date when status is REJECTED', () => {
        const date = new Date('2024-02-02T00:00:00Z')
        renderWithProviders(<StudyStatusDisplay status="REJECTED" date={date} />)

        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('renders nothing for other statuses or missing date', () => {
        renderWithProviders(<StudyStatusDisplay status="INITIATED" date={new Date()} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        renderWithProviders(<StudyStatusDisplay status="APPROVED" date={null} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
