import { it } from 'vitest'
import { FocusedLayoutShell } from './focused-layout-shell'
import { render, screen } from '@testing-library/react'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    render(
        <FocusedLayoutShell>
            <div>hello world</div>
        </FocusedLayoutShell>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
