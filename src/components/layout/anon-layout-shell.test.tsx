import { it } from 'vitest'
import { AnonLayoutShell } from './anon-layout-shell'
import { render, screen } from '@testing-library/react'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    render(
        <AnonLayoutShell>
            <div>hello world</div>
        </AnonLayoutShell>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
