import { act, afterEach, describe, expect, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import dayjs from 'dayjs'
import type { StudyJobStatus } from '@/database/types'
import { formatElapsed, formatStartedWhen, OutputsStatusAlert } from './outputs-status-alert'

describe('formatElapsed', () => {
    const base = new Date('2026-07-20T10:00:00Z').getTime()
    const at = (minutes: number) => base + minutes * 60_000

    it('shows "0 minutes" at zero elapsed', () => expect(formatElapsed(base, base)).toBe('0 minutes'))
    it('shows only minutes under an hour', () => expect(formatElapsed(base, at(5))).toBe('5 minutes'))
    it('singularizes one minute', () => expect(formatElapsed(base, at(1))).toBe('1 minute'))
    it('shows hours and minutes at or past an hour', () =>
        expect(formatElapsed(base, at(65))).toBe('1 hour and 5 minutes'))
    it('singularizes one hour and one minute', () => expect(formatElapsed(base, at(61))).toBe('1 hour and 1 minute'))
    it('pluralizes multiple hours', () => expect(formatElapsed(base, at(2 * 60 + 5))).toBe('2 hours and 5 minutes'))
    it('drops the minutes on the hour', () => {
        expect(formatElapsed(base, at(60))).toBe('1 hour')
        expect(formatElapsed(base, at(120))).toBe('2 hours')
    })
    it('clamps a future/skewed start to "0 minutes"', () => expect(formatElapsed(base, at(-3))).toBe('0 minutes'))
})

describe('formatStartedWhen', () => {
    const base = new Date('2026-07-20T10:00:00Z').getTime()
    const at = (minutes: number) => base + minutes * 60_000

    const absolute = (ms: number) => `on ${dayjs(ms).format('MMM DD, YYYY [at] h:mm A')}`

    it('uses relative "ago" phrasing within 24 hours', () => {
        expect(formatStartedWhen(base, at(5))).toBe('5 minutes ago')
        expect(formatStartedWhen(base, at(23 * 60 + 59))).toBe('23 hours and 59 minutes ago')
    })

    it('switches to an absolute date/time at or past 24 hours', () => {
        expect(formatStartedWhen(base, at(24 * 60))).toBe(absolute(base))
        expect(formatStartedWhen(base, at(48 * 60 + 30))).toBe(absolute(base))
    })
})

describe('OutputsStatusAlert', () => {
    const STARTED = '2026-07-20T10:00:00Z'

    const renderAt = (stageStatus: StudyJobStatus, minutesAgo = 5) => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(new Date(STARTED).getTime() + minutesAgo * 60_000))
        renderWithProviders(<OutputsStatusAlert stageStatus={stageStatus} startedAt={STARTED} />)
    }

    afterEach(() => vi.useRealTimers())

    it('shows the job-packaging copy with a Slack link that opens in a new tab', () => {
        renderAt('JOB-PACKAGING')
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs not ready, code packaging started 5 minutes ago')
        expect(alert).toHaveTextContent('Preparing the code to run in the secure enclave')
        const slack = screen.getByRole('link', { name: /Slack/ })
        expect(slack).toHaveAttribute('target', '_blank')
        expect(slack.getAttribute('href')).toBeTruthy()
    })

    it('shows the job-ready copy (queued, org-admin contact)', () => {
        renderAt('JOB-READY')
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs not ready, code queued 5 minutes ago')
        expect(alert).toHaveTextContent('ready to be picked up by the secure enclave')
        expect(screen.queryByRole('link', { name: /Slack/ })).not.toBeInTheDocument()
    })

    it('shows the job-provisioning copy (queued, preparing the enclave)', () => {
        renderAt('JOB-PROVISIONING')
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs not ready, code queued 5 minutes ago')
        expect(alert).toHaveTextContent('Preparing the secure enclave to run the code')
    })

    it('shows the job-running copy (processing started)', () => {
        renderAt('JOB-RUNNING')
        expect(screen.getByTestId('status-alert')).toHaveTextContent(
            'Outputs not ready, code processing started 5 minutes ago',
        )
    })

    it('updates the elapsed time as time passes (not frozen)', () => {
        renderAt('JOB-RUNNING', 5)
        expect(screen.getByTestId('status-alert')).toHaveTextContent('started 5 minutes ago')
        act(() => {
            vi.advanceTimersByTime(60 * 60_000) // +1h
        })
        expect(screen.getByTestId('status-alert')).toHaveTextContent('started 1 hour and 5 minutes ago')
    })

    it('renders nothing for a status outside the four execution stages', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(STARTED))
        renderWithProviders(<OutputsStatusAlert stageStatus="CODE-APPROVED" startedAt={STARTED} />)
        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
    })
})
