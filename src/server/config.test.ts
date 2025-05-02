import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getConfigValue } from './config'

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { mockClient } from 'aws-sdk-client-mock'

const secretsManagerMock = mockClient(SecretsManagerClient)

describe('getConfigValue', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        secretsManagerMock.reset()
        process.env = { ...ORIGINAL_ENV }
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('should return the value from process.env if it exists', async () => {
        process.env.MY_CONFIG = 'envValue'
        const value = await getConfigValue('MY_CONFIG')
        expect(value).toBe('envValue')
    })

    it('should return the value from AWS secrets if process.env does not contain the key', async () => {
        delete process.env.MY_CONFIG
        process.env.SECRETS_ARN = '1234_ARN'
        // Set up the mock to return a secret containing MY_CONFIG
        secretsManagerMock.on(GetSecretValueCommand, { SecretId: '1234_ARN' }).resolves({
            SecretString: JSON.stringify({ MY_CONFIG: 'secretValue' }),
        })

        const value = await getConfigValue('MY_CONFIG')
        expect(value).toBe('secretValue')
        delete process.env.SECRETS_ARN
    })

    it('should throw an error if the key is not found in AWS secrets', async () => {
        delete process.env.MY_CONFIG
        process.env.SECRETS_ARN = '1234_ARN'

        secretsManagerMock.on(GetSecretValueCommand, { SecretId: 'BAD_ARN' }).resolves({
            SecretString: 'bad-json',
        })
        await expect(getConfigValue('MY_CONFIG')).rejects.toThrow(/failed to parse AWS secrets/)

        secretsManagerMock.on(GetSecretValueCommand, { SecretId: 'BAD_ARN' }).resolves({
            SecretString: JSON.stringify({ OTHER_CONFIG: 'otherValue' }),
        })
        await expect(getConfigValue('MY_CONFIG')).rejects.toThrow(/failed to fetch AWS secrets/)

        secretsManagerMock.on(GetSecretValueCommand, { SecretId: process.env.SECRETS_ARN }).resolves({
            SecretString: JSON.stringify({ OTHER_CONFIG: 'otherValue' }),
        })

        await expect(getConfigValue('MY_CONFIG')).rejects.toThrow('failed to find MY_CONFIG in config')
    })
})
