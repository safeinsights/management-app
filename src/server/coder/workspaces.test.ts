import {
    describe,
    it,
    expect,
    beforeEach,
    mockSessionWithTestData,
    faker,
    insertTestDataSource,
} from '@/tests/unit.helpers'
import { Selectable } from 'kysely'
import { Org } from '@/database/types'
import { generateDataSourcesContextString } from './workspaces'

describe('Workspaces', async () => {
    let org: Selectable<Org>

    beforeEach(async () => {
        const { org: createdOrg } = await mockSessionWithTestData({ isAdmin: true, orgSlug: faker.string.alpha(10) })
        org = createdOrg
    })

    it('generates expected data sources context string for CLAUDE.md', async () => {
        await insertTestDataSource({
            orgId: org.id,
            name: 'Name: Data source 1',
            description: 'Desc: Data source 1',
            urls: [
                {
                    url: 'https://example.com/url1',
                    description: 'Source 1 url1 desc',
                },
                {
                    url: 'https://example.com/url2',
                    description: 'Source 1 url2 desc',
                },
            ],
        })

        await insertTestDataSource({
            orgId: org.id,
            name: 'Name: Data source 2',
            description: 'Desc: Data source 2',
            urls: [
                {
                    url: 'https://example.com/url1',
                    description: null,
                },
                {
                    url: null,
                    description: null,
                },
            ],
        })

        const context = await generateDataSourcesContextString(org.id)
        expect(context).toBe(
            [
                '# Name: Data source 1',
                'Desc: Data source 1',
                'Documentation (Source 1 url1 desc): https://example.com/url1',
                'Documentation (Source 1 url2 desc): https://example.com/url2\n',
                '# Name: Data source 2',
                'Desc: Data source 2',
                'Documentation (No description provided): https://example.com/url1',
            ].join('\n'),
        )
    })
})
