import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { CollapseToggleLink } from './collapse-toggle-link'

describe('CollapseToggleLink', () => {
    it('toggles through a non-submitting button that reports its state', async () => {
        const onClick = vi.fn()
        renderWithProviders(<CollapseToggleLink label="View" isExpanded={false} onClick={onClick} />)

        const button = screen.getByRole('button', { name: 'View' })
        await userEvent.click(button)

        expect(onClick).toHaveBeenCalledOnce()
        expect(button).toHaveAttribute('type', 'button')
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(button.querySelector('.rotatable')).not.toBeNull()
    })

    it('names the region it controls and can drop the chevron', () => {
        renderWithProviders(
            <CollapseToggleLink label="Hide" isExpanded onClick={() => {}} controls="history" withChevron={false} />,
        )

        const button = screen.getByRole('button', { name: 'Hide' })
        expect(button).toHaveAttribute('aria-controls', 'history')
        expect(button.querySelector('.rotatable')).toBeNull()
    })

    it('leaves the state out when the label already says it', () => {
        renderWithProviders(
            <CollapseToggleLink label="Hide history" isExpanded onClick={() => {}} withAriaExpanded={false} />,
        )

        expect(screen.getByRole('button', { name: 'Hide history' })).not.toHaveAttribute('aria-expanded')
    })
})
