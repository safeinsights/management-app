import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import { OpenStaxFeatureFlag, useOpenStaxFeatureFlag } from './openstax-feature-flag'
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
})
