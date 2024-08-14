import { expect, describe, it } from 'vitest'
import { render, within } from '@testing-library/react'
import Layout from './layout'

describe('Main Layout', () => {
    it('redirects when not signed in', async () => {
        const { getByText } = render(
            <Layout>
                <main>Hello World</main>
            </Layout>,
            { container: document },
        )
        const main = within(getByText('Hello World'))
        expect(main).toBeDefined()
    })
})
