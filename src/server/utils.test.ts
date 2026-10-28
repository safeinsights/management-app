import { describe, expect, it } from 'vitest'
import { insertTestDataSource, insertTestOrg } from '@/tests/unit.helpers'
import { generateDataSourcesContextString } from './utils'

describe('generateDataSourcesContextString', () => {
    it('generates expected data sources context string', async () => {
        const org = await insertTestOrg()
        await insertTestDataSource({
            orgId: org.id,
            name: 'Name: Data source 1',
            description: 'Desc: Data source 1',
            urls: [
                { url: 'https://example.com/url1', description: 'Source 1 url1 desc' },
                { url: 'https://example.com/url2', description: 'Source 1 url2 desc' },
            ],
        })
        await insertTestDataSource({
            orgId: org.id,
            name: 'Name: Data source 2',
            description: 'Desc: Data source 2',
            urls: [
                { url: 'https://example.com/url3', description: null },
                { url: null, description: null },
            ],
        })
        const result = await generateDataSourcesContextString(org.id)

        expect(result).toEqual(
            [
                '### Name: Data source 1',
                'Desc: Data source 1',
                'Documentation: https://example.com/url1 (Source 1 url1 desc)',
                'Documentation: https://example.com/url2 (Source 1 url2 desc)\n',
                '### Name: Data source 2',
                'Desc: Data source 2',
                'Documentation: https://example.com/url3 (No description provided)',
            ].join('\n'),
        )
    })

    it('returns placeholder string if there are no data sources', async () => {
        const org = await insertTestOrg()
        const result = await generateDataSourcesContextString(org.id)

        expect(result).toEqual('No data sources provided')
    })
})
