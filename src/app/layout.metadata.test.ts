import { describe, expect, it } from '@/tests/unit.helpers'
import { generateMetadata } from './layout'

describe('root layout metadata', () => {
    it('sets the browser tab title to "SafeInsights"', async () => {
        const metadata = await generateMetadata()
        expect(metadata.title).toBe('SafeInsights')
    })
})
