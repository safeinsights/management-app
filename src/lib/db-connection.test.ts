import { describe, expect, it, vi } from 'vitest'
import { dbConnectionString, resolveDatabaseURL, type SecretFetcher } from './db-connection'

const SECRET = { username: 'u', password: 'p@ss/word', host: 'h', dbname: 'd' }

function fetcher(secretString = JSON.stringify(SECRET)) {
    return { send: vi.fn(async () => ({ SecretString: secretString })) } as unknown as SecretFetcher & {
        send: ReturnType<typeof vi.fn>
    }
}

describe('dbConnectionString', () => {
    it('url-encodes credentials', () => {
        expect(dbConnectionString(SECRET)).toBe('postgres://u:p%40ss%2Fword@h/d')
    })
})

describe('resolveDatabaseURL', () => {
    it('uses DATABASE_URL without touching Secrets Manager', async () => {
        const client = fetcher()
        await expect(resolveDatabaseURL({ DATABASE_URL: 'postgres://local/dev' }, client)).resolves.toBe(
            'postgres://local/dev',
        )
        expect(client.send).not.toHaveBeenCalled()
    })

    it('builds the URL from the secret when only DB_SECRET_ARN is set', async () => {
        await expect(resolveDatabaseURL({ DB_SECRET_ARN: 'arn' }, fetcher())).resolves.toBe(
            'postgres://u:p%40ss%2Fword@h/d',
        )
    })

    it('throws when neither is set', async () => {
        await expect(resolveDatabaseURL({}, fetcher())).rejects.toThrow(/DATABASE_URL or DB_SECRET_ARN/)
    })
})
