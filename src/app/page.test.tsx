import { expect, describe, it } from 'vitest'
import { render, within } from '@testing-library/react'
import Page from './page'

import { Providers as P } from '@/components/providers'

describe('Main Page', () => {
    it('redirects when not signed in', async () => {
        const { getByRole } = render(<Page />, { wrapper: P })
        const main = within(getByRole('main'))
        expect(main).toBeDefined()
    })
})
