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
                documents: [],
            }),
        )

        expect(result.name).toEqual('Some Records')
        expect(result.description).toEqual('De-identified patient data')
        expect(result.documents).toEqual([])
    })

    it('creates a data source with documents', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Some Records',
                description: 'De-identified patient data',
                documents: [
                    {
                        url: 'https://example.com/docs1',
                        description: 'Example docs1 desc',
                    },
                    {
                        url: 'https://example.com/docs2',
                        description: 'Example docs2 desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Some Records')
        expect(result.description).toEqual('De-identified patient data')
        expect(result.documents).toHaveLength(2)
        expect(result.documents).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/docs1',
            description: 'Example docs1 desc',
        })
        expect(result.documents).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/docs2',
            description: 'Example docs2 desc',
        })
    })

    it('coerces empty description to null', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Minimal Source',
                description: '',
                documents: [],
            }),
        )

        expect(result.description).toBeNull()
    })

    it('fetches data sources with codeEnvs and documents', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, name: 'R 4.3 Env', language: 'R' })
        await insertTestDataSource({
            orgId: org.id,
            codeEnvIds: [codeEnv.id],
            name: 'Test DS',
            documents: [
                {
                    url: 'https://example.com/docs',
                    description: 'Example docs desc',
                },
            ],
        })

        const result = actionResult(await fetchOrgDataSourcesAction({ orgSlug: org.slug }))

        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test DS')
        expect(result[0].codeEnvs).toHaveLength(1)
        expect(result[0].codeEnvs[0].name).toEqual('R 4.3 Env')
        expect(result[0].documents).toHaveLength(1)
        expect(result[0].documents).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/docs',
            description: 'Example docs desc',
        })
    })

    it('updates data source fields', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'Original',
            documents: [
                {
                    url: 'https://example.com/docs',
                    description: 'Example docs desc',
                },
            ],
        })

        const result = actionResult(
            await updateOrgDataSourceAction({
                orgSlug: org.slug,
                dataSourceId: ds.id,
                name: 'Updated',
                description: 'New desc',
                documents: [
                    {
                        id: ds.documents[0].id,
                        url: 'https://example.com/docupdates',
                        description: 'Updated example docs desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Updated')
        expect(result.description).toEqual('New desc')
        expect(result.documents).toHaveLength(1)
        expect(result.documents).toContainEqual({
            id: ds.documents[0].id,
            url: 'https://example.com/docupdates',
            description: 'Updated example docs desc',
        })
    })

    it('updates data source docs with new entries and removals', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'Original',
            documents: [
                {
                    url: 'https://example.com/docs',
                    description: 'Example docs desc',
                },
            ],
        })

        const result = actionResult(
            await updateOrgDataSourceAction({
                orgSlug: org.slug,
                dataSourceId: ds.id,
                name: 'Updated',
                documents: [
                    {
                        url: 'https://example.com/newdocs',
                        description: 'New docs desc',
                    },
                ],
            }),
        )

        expect(result.name).toEqual('Updated')
        expect(result.documents).toHaveLength(1)
        expect(result.documents).toContainEqual({
            id: expect.any(String),
            url: 'https://example.com/newdocs',
            description: 'New docs desc',
        })
        expect(result.documents[0].id).not.toEqual(ds.documents[0].id)

        const deletedDocument = await db
            .selectFrom('orgDataSourceDocument')
            .selectAll('orgDataSourceDocument')
            .where('id', '=', ds.documents[0].id)
            .execute()
        expect(deletedDocument).toHaveLength(0)
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

        const joinDocumentRows = await db
            .selectFrom('orgDataSourceDocument')
            .selectAll('orgDataSourceDocument')
            .where('orgDataSourceId', '=', ds.id)
            .execute()
        expect(joinDocumentRows).toHaveLength(0)
    })

    it('denies non-admin from creating data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        const result = await createOrgDataSourceAction({
            orgSlug: org.slug,
            name: 'Should Fail',
            documents: [],
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
