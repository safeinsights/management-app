import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult, insertTestCodeEnv, insertTestDataSource } from '@/tests/unit.helpers'
import {
    createOrgDataSourceAction,
    deleteOrgDataSourceAction,
    fetchOrgDataSourcesAction,
    updateOrgDataSourceAction,
} from './data-sources.actions'
import { deleteOrgCodeEnvAction } from './code-envs.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'

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
})
