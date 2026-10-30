import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clerkOrgSyncEnabled, getConfigValue } from './config'

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { mockClient } from 'aws-sdk-client-mock'

const secretsManagerMock = mockClient(SecretsManagerClient)

describe('getConfigValue', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        secretsManagerMock.reset()
        process.env = { ...ORIGINAL_ENV }
        delete process.env.MAILGUN_DOMAIN
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
        vi.useRealTimers()
    })

    it('returns the value from process.env if it exists', async () => {
        process.env.MAILGUN_DOMAIN = 'envValue'
        expect(await getConfigValue('MAILGUN_DOMAIN')).toBe('envValue')
    })

    it('fetches the secret once and serves later lookups from the cache', async () => {
        process.env.SECRETS_ARN = 'arn:cached'
        secretsManagerMock.on(GetSecretValueCommand, { SecretId: 'arn:cached' }).resolves({
            SecretString: JSON.stringify({ MAILGUN_DOMAIN: 'secretValue' }),
        })

        expect(await getConfigValue('MAILGUN_DOMAIN')).toBe('secretValue')
        expect(await getConfigValue('MAILGUN_DOMAIN')).toBe('secretValue')
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1)
    })

    it('refetches once the cached secret is older than its TTL', async () => {
        vi.useFakeTimers()
        process.env.SECRETS_ARN = 'arn:expiring'
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: JSON.stringify({ MAILGUN_DOMAIN: 'v' }) })

        await getConfigValue('MAILGUN_DOMAIN')
        vi.advanceTimersByTime(5 * 60_000 - 1)
        await getConfigValue('MAILGUN_DOMAIN')
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(1)

        vi.advanceTimersByTime(2)
        await getConfigValue('MAILGUN_DOMAIN')
        expect(secretsManagerMock.commandCalls(GetSecretValueCommand)).toHaveLength(2)
    })

    it('does not cache a failed fetch', async () => {
        process.env.SECRETS_ARN = 'arn:flaky'
        secretsManagerMock
            .on(GetSecretValueCommand)
            .resolvesOnce({ SecretString: 'bad-json' })
            .resolves({ SecretString: JSON.stringify({ MAILGUN_DOMAIN: 'recovered' }) })

        await expect(getConfigValue('MAILGUN_DOMAIN')).rejects.toThrow(/failed to parse AWS secret/)
        expect(await getConfigValue('MAILGUN_DOMAIN')).toBe('recovered')
    })

    it('throws, or returns null, when the key is not in the secret', async () => {
        process.env.SECRETS_ARN = 'arn:missing'
        secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: JSON.stringify({ OTHER: 'x' }) })

        await expect(getConfigValue('MAILGUN_DOMAIN')).rejects.toThrow('failed to find MAILGUN_DOMAIN in config')
        expect(await getConfigValue('MAILGUN_DOMAIN', false)).toBeNull()
    })
})

describe('clerkOrgSyncEnabled', () => {
    it.each([
        [{}, false],
        [{ ENVIRONMENT_ID: 'local' }, false],
        [{ ENVIRONMENT_ID: 'dev' }, true],
        [{ ENVIRONMENT_ID: 'dev', DEPLOY_ID: 'pr123' }, false],
        [{ ENVIRONMENT_ID: 'production' }, true],
        [{ ENVIRONMENT_ID: 'staging', DEPLOY_ID: 'staging' }, true],
    ])('%o -> %s', (env, enabled) => {
        expect(clerkOrgSyncEnabled(env)).toBe(enabled)
    })
})
