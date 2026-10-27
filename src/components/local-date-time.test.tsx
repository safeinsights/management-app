import dayjs from 'dayjs'
import {
    describe,
    expect,
    hydrateServerHtml,
    it,
    renderToServerHtml,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { DATE_TIME_FORMAT, DISPLAY_FORMAT } from '@/lib/dates'
import { LocalDateTime } from './local-date-time'

const AFTER_UTC_MIDNIGHT = '2026-09-24T01:30:00Z'
const ISO = '2026-09-24T01:30:00.000Z'

describe('LocalDateTime', () => {
    it('sends only the instant in the server HTML', () => {
        const html = renderToServerHtml(<LocalDateTime value={AFTER_UTC_MIDNIGHT} prefix=" • " />)

        expect(html).toMatch(new RegExp(`datetime="${ISO}"`, 'i'))
        expect(html).not.toContain('Sep')
        expect(html).not.toContain('•')
    })

    it('shows the date in the browser zone', () => {
        const { container } = renderWithProviders(<LocalDateTime value={AFTER_UTC_MIDNIGHT} />)

        const time = container.querySelector('time')
        expect(time).toHaveAttribute('datetime', ISO)
        expect(time).toHaveTextContent(dayjs(AFTER_UTC_MIDNIGHT).format(DISPLAY_FORMAT))
    })

    it('shows the date and time when given the date-time format', () => {
        renderWithProviders(<LocalDateTime value={AFTER_UTC_MIDNIGHT} format={DATE_TIME_FORMAT} />)

        expect(screen.getByText(dayjs(AFTER_UTC_MIDNIGHT).format(DATE_TIME_FORMAT))).toBeInTheDocument()
    })

    it('keeps the prefix outside the time element', () => {
        const { container } = renderWithProviders(
            <p>
                Code approved
                <LocalDateTime value={AFTER_UTC_MIDNIGHT} prefix=" • " />
            </p>,
        )

        const date = dayjs(AFTER_UTC_MIDNIGHT).format(DISPLAY_FORMAT)
        expect(container.querySelector('p')).toHaveTextContent(`Code approved • ${date}`)
        expect(container.querySelector('time')).toHaveTextContent(new RegExp(`^${date}$`))
    })

    it('hydrates the server HTML without a mismatch, then shows the date', async () => {
        const { recoverableErrors } = hydrateServerHtml(<LocalDateTime value={AFTER_UTC_MIDNIGHT} />)

        expect(await screen.findByText(dayjs(AFTER_UTC_MIDNIGHT).format(DISPLAY_FORMAT))).toBeInTheDocument()
        expect(recoverableErrors).toEqual([])
    })

    it('renders nothing for an invalid instant', () => {
        const { container } = renderWithProviders(<LocalDateTime value="not a date" />)

        expect(container.querySelector('time')).toBeNull()
    })
})
