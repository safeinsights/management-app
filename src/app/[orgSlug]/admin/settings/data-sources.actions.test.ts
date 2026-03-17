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
    it('creates a data source with valid code env', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Some Records',
                description: 'De-identified patient data',
                documentationUrl: 'https://example.com/docs',
                codeEnvId: codeEnv.id,
            }),
        )

        expect(result.name).toEqual('Some Records')
        expect(result.description).toEqual('De-identified patient data')
        expect(result.documentationUrl).toEqual('https://example.com/docs')
        expect(result.codeEnvId).toEqual(codeEnv.id)
    })

    it('coerces empty description and documentationUrl to null', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })

        const result = actionResult(
            await createOrgDataSourceAction({
                orgSlug: org.slug,
                name: 'Minimal Source',
                description: '',
                documentationUrl: '',
                codeEnvId: codeEnv.id,
            }),
        )

        expect(result.description).toBeNull()
        expect(result.documentationUrl).toBeNull()
    })

    it('fetches data sources with codeEnvName', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, name: 'R 4.3 Env', language: 'R' })
        await insertTestDataSource({ orgId: org.id, codeEnvId: codeEnv.id, name: 'Test DS' })

        const result = actionResult(await fetchOrgDataSourcesAction({ orgSlug: org.slug }))

        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test DS')
        expect(result[0].codeEnvName).toEqual('R 4.3 Env')
    })

    it('updates data source fields', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })
        const ds = await insertTestDataSource({ orgId: org.id, codeEnvId: codeEnv.id, name: 'Original' })

        const result = actionResult(
            await updateOrgDataSourceAction({
                orgSlug: org.slug,
                dataSourceId: ds.id,
                name: 'Updated',
                description: 'New desc',
                documentationUrl: 'https://example.com/new',
                codeEnvId: codeEnv.id,
            }),
        )

        expect(result.name).toEqual('Updated')
        expect(result.description).toEqual('New desc')
        expect(result.documentationUrl).toEqual('https://example.com/new')
    })

    it('deletes a data source', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })
        const ds = await insertTestDataSource({ orgId: org.id, codeEnvId: codeEnv.id })

        await deleteOrgDataSourceAction({ orgSlug: org.slug, dataSourceId: ds.id })

        const deleted = await db.selectFrom('orgDataSource').where('id', '=', ds.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('denies non-admin from creating data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })

        const result = await createOrgDataSourceAction({
            orgSlug: org.slug,
            name: 'Should Fail',
            codeEnvId: codeEnv.id,
        })

        expect(isActionError(result)).toBe(true)
    })

    it('rejects creating a data source with a code env from another org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const otherOrg = await insertTestOrg()
        const otherCodeEnv = await insertTestCodeEnv({ orgId: otherOrg.id, language: 'R' })

        const result = await createOrgDataSourceAction({
            orgSlug: org.slug,
            name: 'Cross Org DS',
            codeEnvId: otherCodeEnv.id,
        })

        expect(isActionError(result)).toBe(true)
    })

    it('rejects updating a data source with a code env from another org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })
        const ds = await insertTestDataSource({ orgId: org.id, codeEnvId: codeEnv.id })

        const otherOrg = await insertTestOrg()
        const otherCodeEnv = await insertTestCodeEnv({ orgId: otherOrg.id, language: 'R' })

        const result = await updateOrgDataSourceAction({
            orgSlug: org.slug,
            dataSourceId: ds.id,
            name: 'Updated',
            codeEnvId: otherCodeEnv.id,
        })

        expect(isActionError(result)).toBe(true)
    })

    it('blocks code env deletion when linked data sources exist', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv1 = await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: false })
        await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: false })
        await insertTestDataSource({ orgId: org.id, codeEnvId: codeEnv1.id })

        const result = await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: codeEnv1.id })

        expect(isActionError(result)).toBe(true)
        if (isActionError(result)) {
            expect(result.error).toContain('linked data sources')
        }

        const stillExists = await db.selectFrom('orgCodeEnv').where('id', '=', codeEnv1.id).executeTakeFirst()
        expect(stillExists).toBeDefined()
    })
})
