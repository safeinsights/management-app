import { describe, expect, it } from '@/tests/unit.helpers'
import { generateMetadata } from './layout'

describe('root layout metadata', () => {
    it('falls back to "SafeInsights" for a page that names no title', async () => {
        const metadata = await generateMetadata()
        expect(metadata.title).toMatchObject({ default: 'SafeInsights' })
    })

    it('suffixes each page title with the app name', async () => {
        const metadata = await generateMetadata()
        expect(metadata.title).toMatchObject({ template: '%s - SafeInsights' })
    })
})
