import { it, vi } from 'vitest'
import { FocusedLayoutShell } from './focused-layout-shell'
import { render, screen } from '@testing-library/react'
import { useClerk, useSession } from '@clerk/nextjs'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    vi.mocked(useSession).mockReturnValue({
        session: null,
        isLoaded: true,
        isSignedIn: false,
    })
    vi.mocked(useClerk).mockReturnValue({
        signOut: vi.fn(),
    } as unknown as ReturnType<typeof useClerk>)

    render(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
