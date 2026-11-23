import { db } from '@/database'
import type { Language } from '@/database/types'
import type { DataSourceType } from '@/lib/types'
import { Org } from '@/schema/org'
import { faker } from '@faker-js/faker'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { readTestSupportFile } from './files'

export type MinimalTestOrg = { slug: string; id: string; type: 'enclave' | 'lab' }

export type InsertTestOrgOptions = {
    slug: string
    name?: string
    description?: string | null
    email?: string
    publicKey?: string
    type?: 'enclave' | 'lab'
}

export const insertTestOrg = async (opts: InsertTestOrgOptions = { slug: faker.string.alpha(10) }) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const defaultPublicKey = await readTestSupportFile('public_key.pem')

    const existing = await db.selectFrom('org').where('slug', '=', opts.slug).selectAll('org').executeTakeFirst()
    const org =
        existing ||
        (await db
            .insertInto('org')
            .values({
                slug: opts.slug,
                name: opts.name || faker.company.name(),
                description: opts.description ?? null,
                email: opts.email || `${opts.slug}@example.com`,
                type: opts.type || 'enclave',
                settings: opts.type === 'lab' ? {} : { publicKey: opts.publicKey || defaultPublicKey },
            })
            .returningAll()
            .executeTakeFirstOrThrow())
    ;(await headers()).set(
        'Authorization',
        `Bearer ${jwt.sign(
            {
                iss: opts.slug,
            },
            privateKey,
            { algorithm: 'RS256' },
        )}`,
    )
    return org as Org
}

// Test orgs get a faker name. Rename when a test asserts on the name itself, so two orgs cannot
// collide on one generated value.
export const renameTestOrg = (orgId: string, name: string) =>
    db.updateTable('org').set({ name }).where('id', '=', orgId).execute()

export type InsertTestCodeEnvOptions = {
    orgId: string
    name?: string
    identifier?: string
    language?: Language
    commandLines?: Record<string, string>
    url?: string
    isTesting?: boolean
    starterCodeFileNames?: string[]
    environment?: Array<{ name: string; value: string }>
    dataSourceType?: DataSourceType
}

export const testImageRef = (repoAndTag = 'example.com/img:v1') => `${repoAndTag}@sha256:${'a'.repeat(64)}`

export const insertTestCodeEnv = async (options: InsertTestCodeEnvOptions) => {
    const language = options.language || faker.helpers.arrayElement(['R', 'PYTHON'] as const)
    const fileExtension = language === 'R' ? 'R' : 'py'
    const defaultFileName = `starter.${fileExtension}`

    const commandLines = options.commandLines || (language === 'R' ? { r: 'Rscript %f' } : { py: 'python %f' })
    const starterCodeFileNames = options.starterCodeFileNames || [defaultFileName]

    return await db
        .insertInto('orgCodeEnv')
        .values({
            orgId: options.orgId,
            name: options.name || `${language} ${faker.system.semver()} Code Environment`,
            identifier: options.identifier || faker.string.alphanumeric(8).toLowerCase(),
            language,
            commandLines,
            url:
                options.url ||
                testImageRef(`example.com/${language.toLowerCase()}-base:${faker.string.alphanumeric(6)}`),
            isTesting: options.isTesting ?? false,
            starterCodeFileNames: starterCodeFileNames,
            settings: { environment: options.environment ?? [] },
            dataSourceType: options.dataSourceType ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
}

type TestDataSourceUrl = {
    url: string | null
    description: string | null
}

export type InsertTestDataSourceOptions = {
    orgId: string
    codeEnvIds?: string[]
    name?: string
    description?: string | null
    urls?: TestDataSourceUrl[]
}

export const insertTestDataSource = async (options: InsertTestDataSourceOptions) => {
    const dataSource = await db
        .insertInto('orgDataSource')
        .values({
            orgId: options.orgId,
            name: options.name || `Data Source ${faker.string.alphanumeric(6)}`,
            description: options.description ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const codeEnvIds = options.codeEnvIds
    if (codeEnvIds?.length) {
        await db
            .insertInto('orgDataSourceCodeEnv')
            .values(codeEnvIds.map((codeEnvId) => ({ dataSourceId: dataSource.id, codeEnvId })))
            .execute()
    }

    const urls = options.urls
    const createdUrls = []
    if (urls?.length) {
        const urlRows = urls.map((u) => ({
            ...u,
            orgDataSourceId: dataSource.id,
        }))

        const res = await db
            .insertInto('orgDataSourceUrl')
            .values(urlRows)
            .returning(['id', 'url', 'description'])
            .execute()
        createdUrls.push(...res)
    }

    return { ...dataSource, urls: createdUrls }
}
