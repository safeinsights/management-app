import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import type { Route } from 'next'
import type { StepNav } from '@/lib/study-screen'
import { StepNavigation } from './step-navigation'

const action = (label: string, testId: string, variant: 'solid' | 'outline' | 'subtle', href = '/x') => ({
    label,
    testId,
    variant,
    href: href as Route,
})

describe('StepNavigation', () => {
    it('renders every filled slot as a link to its destination', () => {
        const nav: StepNav = {
            back: action('Previous step', 'cta-previous-step', 'subtle', '/back'),
            secondary: action('Edit code', 'cta-edit-code', 'outline', '/resubmit'),
            forward: action('Back to my studies', 'cta-back-to-my-studies', 'solid', '/dashboard'),
        }
        renderWithProviders(<StepNavigation nav={nav} />)

        expect(screen.getByTestId('cta-previous-step')).toHaveAttribute('href', '/back')
        expect(screen.getByTestId('cta-edit-code')).toHaveAttribute('href', '/resubmit')
        expect(screen.getByTestId('cta-back-to-my-studies')).toHaveAttribute('href', '/dashboard')
    })

    it('omits slots the nav does not fill', () => {
        renderWithProviders(<StepNavigation nav={{ forward: action('Next step', 'cta-next-step', 'solid') }} />)

        expect(screen.getByTestId('cta-next-step')).toBeInTheDocument()
        expect(screen.queryByTestId('cta-previous-step')).not.toBeInTheDocument()
        expect(screen.queryByTestId('cta-edit-code')).not.toBeInTheDocument()
    })

    it('renders nothing when no slot is filled, so a draft page shows no empty nav row', () => {
        renderWithProviders(<StepNavigation nav={{}} />)

        expect(screen.queryByTestId('step-navigation')).not.toBeInTheDocument()
    })
})
