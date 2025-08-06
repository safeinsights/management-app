import { it } from 'vitest'
import { FocusedLayoutShell } from './focused-layout-shell'
import { render, screen } from '@testing-library/react'
import { mockClerkSession } from '@/tests/unit.helpers'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    mockClerkSession(null)

    render(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
