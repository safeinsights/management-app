import { describe, expect, it, vi } from 'vitest'
import {
    mockSessionWithTestData,
    actionResult,
    insertTestCodeEnv,
    insertTestDataSource,
    insertTestOrg,
} from '@/tests/unit.helpers'
import {
    createOrgDataSourceAction,
    deleteOrgDataSourceAction,
    fetchOrgDataSourcesAction,
    updateOrgDataSourceAction,
} from './data-sources.actions'
import { deleteOrgCodeEnvAction } from './code-envs.actions'
import { createOrgDataSourceSchema, dataSourceFormSchema } from './data-sources.schema'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'

const XSS_URLS = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        deleteS3File: vi.fn().mockResolvedValue(undefined),
        deleteFolderContents: vi.fn().mockResolvedValue(undefined),
        createAthenaDatabase: vi.fn().mockResolvedValue(undefined),
        deleteAthenaDatabase: vi.fn().mockResolvedValue(undefined),
        createPgDatabase: vi.fn().mockResolvedValue(undefined),
        deletePgDatabase: vi.fn().mockResolvedValue(undefined),
    }
})

describe('Data Source Actions', () => {
    it('creates a data source', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Some Records',
                description: 'De-identified patient data',
                urls: [],
            }),
        )

        expect(result.name).toEqual('Some Records')
        expect(result.description).toEqual('De-identified patient data')
        expect(result.urls).toEqual([])
    })

    it('creates a data source with urls', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Some Records',
                description: 'De-identified patient data',
                urls: [
                    {
                        url: 'https://example.com/url1',
                        description: 'Example url1 desc',
                    },
                    {
                        url: 'https://example.com/url2',
                        description: 'Example url2 desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Some Records')
        expect(result.description).toEqual('De-identified patient data')
        expect(result.urls).toHaveLength(2)
        expect(result.urls).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/url1',
            description: 'Example url1 desc',
        })
        expect(result.urls).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/url2',
            description: 'Example url2 desc',
        })
    })

    it('coerces empty description to null', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Minimal Source',
                description: '',
                urls: [],
            }),
        )

        expect(result.description).toBeNull()
    })

    it('fetches data sources with codeEnvs and urls', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, name: 'R 4.3 Env', language: 'R' })
        await insertTestDataSource({
            orgId: org.id,
            codeEnvIds: [codeEnv.id],
            name: 'Test DS',
            urls: [
                {
                    url: 'https://example.com/url',
                    description: 'Example url desc',
                },
            ],
        })

        const result = actionResult(await fetchOrgDataSourcesAction({ orgSlug: org.slug }))

        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test DS')
        expect(result[0].codeEnvs).toHaveLength(1)
        expect(result[0].codeEnvs[0].name).toEqual('R 4.3 Env')
        expect(result[0].urls).toHaveLength(1)
        expect(result[0].urls).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/url',
            description: 'Example url desc',
        })
    })

    it('updates data source fields', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'Original',
            urls: [
                {
                    url: 'https://example.com/url',
                    description: 'Example url desc',
                },
            ],
        })

        const result = actionResult(
            await updateOrgDataSourceAction({
                orgSlug: org.slug,
                dataSourceId: ds.id,
                name: 'Updated',
                description: 'New desc',
                urls: [
                    {
                        id: ds.urls[0].id,
                        url: 'https://example.com/urlupdates',
                        description: 'Updated example url desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Updated')
        expect(result.description).toEqual('New desc')
        expect(result.urls).toHaveLength(1)
        expect(result.urls).toContainEqual({
            id: ds.urls[0].id,
            url: 'https://example.com/urlupdates',
            description: 'Updated example url desc',
        })
    })

    it('updates data source urls with new entries and removals', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'Original',
            urls: [
                {
                    url: 'https://example1.com/url1',
                    description: 'Example url1 desc',
                },
                {
                    url: 'https://example2.com/url2',
                    description: 'Example url2 desc',
                },
            ],
        })

        const result = actionResult(
            await updateOrgDataSourceAction({
                orgSlug: org.slug,
                dataSourceId: ds.id,
                name: 'Updated',
                urls: [
                    {
                        url: 'https://example.com/newurl',
                        description: 'New url desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Updated')
        expect(result.urls).toHaveLength(1)
        expect(result.urls).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/newurl',
            description: 'New url desc',
        })

        const deletedUrl1 = await db
            .selectFrom('orgDataSourceUrl')
            .selectAll('orgDataSourceUrl')
            .where('id', '=', ds.urls[0].id)
            .execute()
        expect(deletedUrl1).toHaveLength(0)
        const deletedUrl2 = await db
            .selectFrom('orgDataSourceUrl')
            .selectAll('orgDataSourceUrl')
            .where('id', '=', ds.urls[1].id)
            .execute()
        expect(deletedUrl2).toHaveLength(0)
    })

    it('deletes a data source and cascades join rows', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })
        const ds = await insertTestDataSource({ orgId: org.id, codeEnvIds: [codeEnv.id] })

        await deleteOrgDataSourceAction({ orgSlug: org.slug, dataSourceId: ds.id })

        const deleted = await db.selectFrom('orgDataSource').where('id', '=', ds.id).executeTakeFirst()
        expect(deleted).toBeUndefined()

        const joinCodeEnvRows = await db
            .selectFrom('orgDataSourceCodeEnv')
            .selectAll('orgDataSourceCodeEnv')
            .where('dataSourceId', '=', ds.id)
            .execute()
        expect(joinCodeEnvRows).toHaveLength(0)

        const joinUrlRows = await db
            .selectFrom('orgDataSourceUrl')
            .selectAll('orgDataSourceUrl')
            .where('orgDataSourceId', '=', ds.id)
            .execute()
        expect(joinUrlRows).toHaveLength(0)
    })

    it('denies non-admin from creating data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        const result = await createOrgDataSourceAction({
            orgSlug: org.slug,
            name: 'Should Fail',
            urls: [],
        })

        expect(isActionError(result)).toBe(true)
    })

    it.each(XSS_URLS)('rejects the non-http scheme %s on a url row', (url) => {
        const result = createOrgDataSourceSchema.safeParse({
            name: 'Some Records',
            urls: [{ url, description: 'Looks harmless' }],
        })

        expect(result.success).toBe(false)
    })

    it.each(XSS_URLS)('rejects the non-http scheme %s on the draft url field', (url) => {
        const result = dataSourceFormSchema.safeParse({
            name: 'Some Records',
            urls: [],
            newUrl: url,
            newUrlDescription: 'Looks harmless',
        })

        expect(result.success).toBe(false)
    })

    it.each(['http://example.com/data', 'https://example.com/data'])('accepts %s', (url) => {
        expect(
            createOrgDataSourceSchema.safeParse({ name: 'Some Records', urls: [{ url, description: 'd' }] }).success,
        ).toBe(true)
        expect(
            dataSourceFormSchema.safeParse({ name: 'Some Records', urls: [], newUrl: url, newUrlDescription: 'd' })
                .success,
        ).toBe(true)
    })

    it('rejects a javascript: url at the server action', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = await createOrgDataSourceAction({
            orgSlug: org.slug,
            name: 'Should Fail',
            urls: [{ url: 'javascript:alert(1)', description: 'Looks harmless' }],
        })

        expect(isActionError(result)).toBe(true)

        const rows = await db.selectFrom('orgDataSource').where('name', '=', 'Should Fail').execute()
        expect(rows).toHaveLength(0)
    })

    it('blocks code env deletion when linked data sources exist', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv1 = await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: false })
        await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: false })
        await insertTestDataSource({ orgId: org.id, codeEnvIds: [codeEnv1.id] })

        const result = await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: codeEnv1.id })

        expect(isActionError(result)).toBe(true)
        if (isActionError(result)) {
            expect(result.error).toContain('linked data sources')
        }

        const stillExists = await db.selectFrom('orgCodeEnv').where('id', '=', codeEnv1.id).executeTakeFirst()
        expect(stillExists).toBeDefined()
    })

    // The flow that made `view Org` unconditioned (97c118b1): a lab researcher picks a dataset
    // from an enclave org they do not belong to.
    it('stays readable cross-org: proposal dataset picker (97c118b1)', async () => {
        const enclaveOrg = await insertTestOrg({ slug: 'unrelated-enclave-catalog', type: 'enclave' })
        await insertTestDataSource({
            orgId: enclaveOrg.id,
            name: 'Advertised Enclave Dataset',
            description: 'Listed in the proposal dataset picker',
        })

        await mockSessionWithTestData({ orgType: 'lab', isAdmin: false })

        const result = actionResult(await fetchOrgDataSourcesAction({ orgSlug: enclaveOrg.slug }))
        expect(result).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'Advertised Enclave Dataset' })]),
        )
    })
})
