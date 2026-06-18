import { describe, expect, it, vi } from 'vitest'

import {
    DbCredentials,
    INVALID_PASSWORD_CODE,
    isInvalidPasswordError,
    poolSettingsFromSecret,
    resolveDbSource,
    type ResolvedDbSecret,
    type SecretFetcher,
} from './db-credentials'

const SECRET: ResolvedDbSecret = {
    username: 'mgmntAppDBUser',
    password: 'old-pw',
    host: 'db.example.internal',
    dbname: 'management',
}

// A SecretFetcher whose returned SecretString can change between calls.
function fetcherFor(secrets: ResolvedDbSecret[]): { fetcher: SecretFetcher; calls: () => number } {
    let i = 0
    const send = vi.fn(async () => {
        const secret = secrets[Math.min(i, secrets.length - 1)]
        i += 1
        return { SecretString: JSON.stringify(secret) }
    })
    return { fetcher: { send } as unknown as SecretFetcher, calls: () => send.mock.calls.length }
}

describe('poolSettingsFromSecret', () => {
    it('assembles an SSL-enabled connection string with url-encoded credentials', () => {
        const settings = poolSettingsFromSecret({ ...SECRET, password: 'p@ss/word' })
        expect(settings.connectionString).toBe('postgres://mgmntAppDBUser:p%40ss%2Fword@db.example.internal/management')
        expect(settings.ssl).toEqual({ rejectUnauthorized: false })
    })
})

describe('isInvalidPasswordError', () => {
    it('matches the Postgres 28P01 SQLSTATE', () => {
        expect(isInvalidPasswordError({ code: INVALID_PASSWORD_CODE })).toBe(true)
    })

    it('ignores other errors', () => {
        expect(isInvalidPasswordError(new Error('boom'))).toBe(false)
        expect(isInvalidPasswordError({ code: '08006' })).toBe(false)
        expect(isInvalidPasswordError(null)).toBe(false)
        expect(isInvalidPasswordError('28P01')).toBe(false)
    })
})

describe('DbCredentials.refresh', () => {
    it('returns true and updates the cache when the password changed', async () => {
        const { fetcher } = fetcherFor([SECRET, { ...SECRET, password: 'new-pw' }])
        const creds = await DbCredentials.resolve('arn:secret', fetcher)
        expect(creds.current().password).toBe('old-pw')

        await expect(creds.refresh()).resolves.toBe(true)
        expect(creds.current().password).toBe('new-pw')
        expect(creds.poolSettings().connectionString).toContain('new-pw')
    })

    it('returns false and keeps the cache when the password is unchanged', async () => {
        const { fetcher } = fetcherFor([SECRET, SECRET])
        const creds = await DbCredentials.resolve('arn:secret', fetcher)

        await expect(creds.refresh()).resolves.toBe(false)
        expect(creds.current().password).toBe('old-pw')
    })
})

describe('resolveDbSource', () => {
    it('uses DATABASE_URL directly without touching Secrets Manager', async () => {
        const { fetcher, calls } = fetcherFor([SECRET])
        const source = await resolveDbSource({ DATABASE_URL: 'postgres://local/dev' }, fetcher)
        expect(source.kind).toBe('connectionString')
        if (source.kind === 'connectionString') {
            expect(source.settings.connectionString).toBe('postgres://local/dev')
        }
        expect(calls()).toBe(0)
    })

    it('resolves the secret when only DB_SECRET_ARN is set', async () => {
        const { fetcher } = fetcherFor([SECRET])
        const source = await resolveDbSource({ DB_SECRET_ARN: 'arn:secret' }, fetcher)
        expect(source.kind).toBe('secret')
        if (source.kind === 'secret') {
            expect(source.credentials.poolSettings().connectionString).toContain('old-pw')
        }
    })

    it('throws when neither DATABASE_URL nor DB_SECRET_ARN is set', async () => {
        const { fetcher } = fetcherFor([SECRET])
        await expect(resolveDbSource({}, fetcher)).rejects.toThrow(/DATABASE_URL or DB_SECRET_ARN/)
    })
})
