import dayjs from 'dayjs'
import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { logViewer } from './log-viewer'

describe('logViewer', () => {
    it('shows each entry time in the app format, not the browser locale', () => {
        const timestamp = new Date('2026-09-24T01:30:05Z').getTime()
        renderWithProviders(<>{logViewer('run.log', JSON.stringify([{ timestamp, message: 'started' }]))}</>)

        expect(screen.getByText(dayjs(timestamp).format('hh:mm:ss a'))).toBeInTheDocument()
        expect(screen.getByText('started')).toBeInTheDocument()
    })
})
