import { it } from 'vitest'
import { AnonLayout } from './anon-layout'
import { render, screen } from '@testing-library/react'

import { TestingProviders } from '@/tests/providers'

it('renders without a user', async () => {
    render(
        <AnonLayout>
            <div>hello world</div>
        </AnonLayout>,
        { wrapper: TestingProviders },
    )

    await screen.findByText('hello world')
})
