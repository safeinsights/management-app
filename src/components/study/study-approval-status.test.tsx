import { describe, it, expect } from 'vitest'
import { renderToServerHtml, renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import StudyApprovalStatus from './study-approval-status'
import dayjs from 'dayjs'

describe('StudyApprovalStatus', () => {
    it('shows approved date when status is APPROVED', () => {
        const date = new Date('2024-01-01T00:00:00Z')
        renderWithProviders(<StudyApprovalStatus status="APPROVED" date={date} />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected date when status is REJECTED', () => {
        const date = new Date('2024-02-02T00:00:00Z')
        renderWithProviders(<StudyApprovalStatus status="REJECTED" date={date} />)

        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(date).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('leaves " on" out of the server HTML along with the date', () => {
        const html = renderToServerHtml(
            <StudyApprovalStatus status="APPROVED" date={new Date('2026-09-24T01:30:00Z')} />,
        )

        expect(html).toMatch(/Approved<time datetime="2026-09-24T01:30:00.000Z"/i)
    })

    it('renders nothing for other statuses or missing date', () => {
        renderWithProviders(<StudyApprovalStatus status="DRAFT" date={new Date()} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        renderWithProviders(<StudyApprovalStatus status="APPROVED" date={null} />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
