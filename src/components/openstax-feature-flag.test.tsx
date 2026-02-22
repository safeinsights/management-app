import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import {
    FeatureFlagRequiredAlert,
    OpenStaxFeatureFlag,
    useOpenStaxFeatureFlag,
    isFeatureFlagOrg,
} from './openstax-feature-flag'
import { FC } from 'react'

// Mock the dependencies
vi.mock('./spy-mode-context', () => ({
    useSpyMode: vi.fn(),
}))

vi.mock('@/hooks/session', () => ({
    useSession: vi.fn(),
}))

import { useSpyMode } from './spy-mode-context'
import { useSession } from '@/hooks/session'
import type { Mock } from 'vitest'

const mockUseSpyMode = useSpyMode as Mock
const mockUseSession = useSession as Mock

describe('OpenStaxFeatureFlag', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('useOpenStaxFeatureFlag hook', () => {
        it('returns false when user is not in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: false })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { openstax: { slug: 'openstax' } } },
            })

            const { result } = renderHook(() => useOpenStaxFeatureFlag())

            expect(result.current).toBe(false)
        })

        it('returns false when user does not belong to OpenStax org', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { 'other-org': { slug: 'other-org' } } },
            })

            const { result } = renderHook(() => useOpenStaxFeatureFlag())

            expect(result.current).toBe(false)
        })

        it('returns true when user belongs to openstax org AND is in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { openstax: { slug: 'openstax' } } },
            })

            const { result } = renderHook(() => useOpenStaxFeatureFlag())

            expect(result.current).toBe(true)
        })

        it('returns true when user belongs to openstax-lab org AND is in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { 'openstax-lab': { slug: 'openstax-lab' } } },
            })

            const { result } = renderHook(() => useOpenStaxFeatureFlag())

            expect(result.current).toBe(true)
        })
    })

    describe('OpenStaxFeatureFlag component', () => {
        const DefaultContent: FC = () => <div data-testid="default">Default Content</div>
        const OptInContent: FC = () => <div data-testid="optin">Opt-In Content</div>

        it('renders default content when user is not in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: false })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { openstax: { slug: 'openstax' } } },
            })

            render(<OpenStaxFeatureFlag defaultContent={<DefaultContent />} optInContent={<OptInContent />} />)

            expect(screen.getByTestId('default')).toBeInTheDocument()
            expect(screen.queryByTestId('optin')).not.toBeInTheDocument()
        })

        it('renders default content when user does not belong to OpenStax org', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { 'other-org': { slug: 'other-org' } } },
            })

            render(<OpenStaxFeatureFlag defaultContent={<DefaultContent />} optInContent={<OptInContent />} />)

            expect(screen.getByTestId('default')).toBeInTheDocument()
            expect(screen.queryByTestId('optin')).not.toBeInTheDocument()
        })

        it('renders opt-in content when user belongs to OpenStax org AND is in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { openstax: { slug: 'openstax' } } },
            })

            render(<OpenStaxFeatureFlag defaultContent={<DefaultContent />} optInContent={<OptInContent />} />)

            expect(screen.getByTestId('optin')).toBeInTheDocument()
            expect(screen.queryByTestId('default')).not.toBeInTheDocument()
        })

        it('renders opt-in content when user belongs to openstax-lab org AND is in spy mode', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })
            mockUseSession.mockReturnValue({
                isLoaded: true,
                session: { orgs: { 'openstax-lab': { slug: 'openstax-lab' } } },
            })

            render(<OpenStaxFeatureFlag defaultContent={<DefaultContent />} optInContent={<OptInContent />} />)

            expect(screen.getByTestId('optin')).toBeInTheDocument()
            expect(screen.queryByTestId('default')).not.toBeInTheDocument()
        })
    })

    describe('isFeatureFlagOrg', () => {
        it('returns true for openstax', () => {
            expect(isFeatureFlagOrg('openstax')).toBe(true)
        })

        it('returns true for openstax-lab', () => {
            expect(isFeatureFlagOrg('openstax-lab')).toBe(true)
        })

        it('returns false for other orgs', () => {
            expect(isFeatureFlagOrg('other-org')).toBe(false)
        })
    })

    describe('FeatureFlagRequiredAlert', () => {
        it('renders default message when isNewFlow is true and spy mode is off', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: false })

            renderWithProviders(<FeatureFlagRequiredAlert isNewFlow />)

            expect(screen.getByText('Action Required')).toBeInTheDocument()
            expect(screen.getByText(/enable spy mode to continue/i)).toBeInTheDocument()
        })

        it('renders custom message when provided', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: false })

            renderWithProviders(<FeatureFlagRequiredAlert isNewFlow message="Custom alert text" />)

            expect(screen.getByText('Custom alert text')).toBeInTheDocument()
        })

        it('renders nothing when isNewFlow is true and spy mode is on', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: true })

            const { container } = render(<FeatureFlagRequiredAlert isNewFlow />)

            expect(container).toBeEmptyDOMElement()
        })

        it('renders nothing when isNewFlow is false and spy mode is off', () => {
            mockUseSpyMode.mockReturnValue({ isSpyMode: false })

            const { container } = render(<FeatureFlagRequiredAlert isNewFlow={false} />)

            expect(container).toBeEmptyDOMElement()
        })
    })
})
