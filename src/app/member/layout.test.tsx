import { it, expect, type Mock } from 'vitest'
import { useUser as origUseUser } from '@clerk/nextjs'
import MemberLayout from './layout'
import { render, screen } from '@testing-library/react'

import { TestingProviders } from '@/tests/providers'

const useUser = origUseUser as unknown as Mock

it('renders null if user is null', async () => {
    useUser.mockResolvedValue({ user: null })
    render(
        <MemberLayout>
            <div>Test</div>
        </MemberLayout>,
        { wrapper: TestingProviders },
    )
    expect(screen.queryByText('Test')).toBeNull()
})
