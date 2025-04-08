import { it, expect, type Mock } from 'vitest'
import { useUser, useAuth } from '@clerk/nextjs'
import ResearcherLayout from './layout'
import { render, screen } from '@testing-library/react'
import { TestingProviders } from '@/tests/providers'
import router from 'next-router-mock'

it('redirects if user is not found', async () => {
    ;(useAuth as Mock).mockImplementation(() => ({ isLoaded: true, userId: null }))
    ;(useUser as Mock).mockImplementation(() => ({ user: null, isSignedIn: false }))

    render(
        <ResearcherLayout>
            <div>Test</div>
        </ResearcherLayout>,
        { wrapper: TestingProviders },
    )

    expect(screen.queryByText('Test')).not.toBeNull()
    expect(router.asPath).toEqual('/account/signin')
})
