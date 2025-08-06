import { it, vi } from 'vitest'
import { FocusedLayoutShell } from './focused-layout-shell'
import { render, screen } from '@testing-library/react'
import { useClerk, useSession } from '@clerk/nextjs'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    vi.mocked(useSession).mockReturnValue({
        session: null,
    } as any)
    vi.mocked(useClerk).mockReturnValue({
        signOut: vi.fn(),
    } as any)

    render(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
