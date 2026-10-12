import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import type { Route } from 'next'
import { LinkWithIcon } from './links'

describe('LinkWithIcon', () => {
    const icon = <svg data-testid="icon" />

    it('renders the text and href, forwarding target and data-testid', () => {
        renderWithProviders(
            <LinkWithIcon
                href={'/openstax/study/abc/submitted' as Route}
                target="_blank"
                icon={icon}
                data-testid="my-link"
            >
                View approved initial request
            </LinkWithIcon>,
        )

        const link = screen.getByTestId('my-link')
        expect(link).toHaveTextContent('View approved initial request')
        expect(link).toHaveAttribute('href', '/openstax/study/abc/submitted')
        expect(link).toHaveAttribute('target', '_blank')
        expect(screen.getByTestId('icon')).toBeInTheDocument()
    })

    it('renders the icon after the text by default (trailing)', () => {
        renderWithProviders(
            <LinkWithIcon href={'/x' as Route} icon={icon} data-testid="link">
                Label
            </LinkWithIcon>,
        )

        const link = screen.getByTestId('link')
        const iconEl = screen.getByTestId('icon')
        expect(link.textContent).toBe('Label')
        expect(iconEl.parentElement?.lastElementChild).toBe(iconEl)
    })

    it('renders the icon before the text when iconPosition="leading"', () => {
        renderWithProviders(
            <LinkWithIcon href={'/x' as Route} icon={icon} iconPosition="leading" data-testid="link">
                Label
            </LinkWithIcon>,
        )

        const iconEl = screen.getByTestId('icon')
        expect(iconEl.parentElement?.firstElementChild).toBe(iconEl)
    })

    it('merges a caller className with the base layout instead of replacing it', () => {
        renderWithProviders(
            <LinkWithIcon href={'/x' as Route} icon={icon} data-testid="link" className="caller">
                Label
            </LinkWithIcon>,
        )

        const link = screen.getByTestId('link')
        expect(link).toHaveClass('caller')
        expect(link).toHaveClass('nowrap')
    })
})
