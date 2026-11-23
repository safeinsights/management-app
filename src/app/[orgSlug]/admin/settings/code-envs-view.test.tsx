import { renderWithProviders, userEvent, vi } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CodeEnvRowView, type CodeEnvRowViewProps, ScanStatusBadge } from './code-envs-view'

const noop = () => {}

const badgeStyle = (text: string) => screen.getByText(text).closest('.mantine-Badge-root')?.getAttribute('style') ?? ''

const renderRow = (props: Partial<CodeEnvRowViewProps> = {}) =>
    renderWithProviders(
        <CodeEnvRowView
            name="R 4.4"
            language="R"
            isTesting={false}
            isDefault={false}
            latestScanStatus={null}
            detailOpened={false}
            onToggleDetail={noop}
            onLanguageBadgeClick={noop}
            onScanBadgeClick={noop}
            actions={null}
            detail={null}
            {...props}
        />,
    )

// QA measured Scan Passed at 2.13:1 and Testing at 2.23:1 on Mantine's stock teal and orange. The
// theme pairs the SI status ramps' light variant with the library tokens, so a badge only reaches
// that pairing by naming an SI ramp.
describe('code environment badges', () => {
    it('paints Scan Passed from the green light variant', () => {
        renderWithProviders(<ScanStatusBadge name="R 4.4" status="SCAN-COMPLETE" />)
        expect(badgeStyle('Scan Passed')).toContain('--mantine-color-green-light')
    })

    it('paints Scan Pending from the neutral grey light variant', () => {
        renderWithProviders(<ScanStatusBadge name="R 4.4" status="SCAN-PENDING" />)
        expect(badgeStyle('Scan Pending')).toContain('--mantine-color-grey-light')
    })

    it('paints Testing and Default from SI ramps', () => {
        renderRow({ isTesting: true, isDefault: true })
        expect(badgeStyle('Testing')).toContain('--mantine-color-yellow-light')
        expect(badgeStyle('Default')).toContain('--mantine-color-purple-filled')
    })
})

describe('code environment details toggle', () => {
    it.each([true, false])('reports the details toggle as expanded=%s', (detailOpened) => {
        renderRow({ detailOpened })
        expect(screen.getByRole('button', { name: 'Details for R 4.4' })).toHaveAttribute(
            'aria-expanded',
            String(detailOpened),
        )
    })
})

describe('code environment language badge', () => {
    it('is reached by Tab after the details toggle and opens starter code with Enter or Space', async () => {
        const onLanguageBadgeClick = vi.fn()
        renderRow({ onLanguageBadgeClick })

        await userEvent.tab()
        expect(screen.getByRole('button', { name: 'Details for R 4.4' })).toHaveFocus()
        await userEvent.tab()
        expect(screen.getByRole('button', { name: 'View R starter code for R 4.4' })).toHaveFocus()

        await userEvent.keyboard('{Enter}')
        await userEvent.keyboard(' ')
        expect(onLanguageBadgeClick).toHaveBeenCalledTimes(2)
    })
})

describe('code environment scan badge', () => {
    it('opens finished scan results from the keyboard', async () => {
        const onScanBadgeClick = vi.fn()
        renderRow({ latestScanStatus: 'SCAN-FAILED', onScanBadgeClick })
        screen.getByRole('button', { name: 'View Scan Failed results for R 4.4' }).focus()
        await userEvent.keyboard('{Enter}')
        expect(onScanBadgeClick).toHaveBeenCalledOnce()
    })

    it('is not a button while the scan is pending', () => {
        renderRow({ latestScanStatus: 'SCAN-PENDING' })
        expect(screen.queryByRole('button', { name: /results for/i })).not.toBeInTheDocument()
    })
})
