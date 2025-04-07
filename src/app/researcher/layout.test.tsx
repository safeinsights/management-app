import { it, expect, type Mock } from 'vitest'
import { useUser as origUseUser } from '@clerk/nextjs'
import ResearcherLayout from './layout'
import { render, screen } from '@testing-library/react'
import { TestingProviders } from '@/tests/providers'

const useUser = origUseUser as unknown as Mock

it('renders null if user is null', async () => {
    useUser.mockResolvedValue({ user: null })
    render(
        <ResearcherLayout>
            <div>Test</div>
        </ResearcherLayout>,
        { wrapper: TestingProviders },
    )
    expect(screen.queryByText('Test')).toBeNull()
})
