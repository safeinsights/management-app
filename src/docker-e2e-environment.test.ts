import { describe, expect, it } from 'vitest'
import { dockerE2EEnvironment } from '../bin/docker-e2e-environment'

describe('dockerE2EEnvironment', () => {
    it('loads .env.test over .env and ambient values', () => {
        const environment = dockerE2EEnvironment({
            ambient: { FEATURE_VALUE: 'ambient', AMBIENT_ONLY: 'kept' },
            envFile: { FEATURE_VALUE: 'env', ENV_ONLY: 'kept' },
            envTestFile: { FEATURE_VALUE: 'env-test', TEST_ONLY: 'kept' },
        })

        expect(environment).toMatchObject({
            FEATURE_VALUE: 'env-test',
            AMBIENT_ONLY: 'kept',
            ENV_ONLY: 'kept',
            TEST_ONLY: 'kept',
        })
    })

    it('forces Docker infrastructure values after loading environment files', () => {
        const conflicting = {
            DATABASE_URL: 'postgres://wrong/database',
            S3_ENDPOINT: 'https://wrong.example',
            S3_BROWSER_ENDPOINT: 'https://wrong-browser.example',
            AWS_ACCESS_KEY_ID: 'wrong',
            AWS_SECRET_ACCESS_KEY: 'wrong',
            AWS_REGION: 'wrong',
            BUCKET_NAME: 'wrong',
            E2E_BASE_URL: 'https://wrong.example',
            PORT: '9999',
            CI: 'true',
            AWS_PROFILE: 'wrong',
            CLAUDE_API_KEY: 'wrong',
            DB_SECRET_ARN: 'wrong',
            SECRETS_ARN: 'wrong',
        }
        const environment = dockerE2EEnvironment({
            ambient: conflicting,
            envFile: conflicting,
            envTestFile: conflicting,
        })

        expect(environment).toMatchObject({
            E2E_MODE: 'docker',
            DATABASE_URL: 'postgres://si:si@127.0.0.1:5433/si_test',
            S3_ENDPOINT: 'http://127.0.0.1:8334',
            S3_BROWSER_ENDPOINT: 'http://127.0.0.1:8334',
            AWS_ACCESS_KEY_ID: 'si-local-s3',
            AWS_SECRET_ACCESS_KEY: 'si-local-s3',
            AWS_REGION: 'us-east-1',
            BUCKET_NAME: 'mgmt-app-local',
            E2E_BASE_URL: 'http://localhost:4101',
            PORT: '4101',
        })
        expect(environment.CI).toBeUndefined()
        expect(environment.AWS_PROFILE).toBeUndefined()
        expect(environment.CLAUDE_API_KEY).toBeUndefined()
        expect(environment.DB_SECRET_ARN).toBeUndefined()
        expect(environment.SECRETS_ARN).toBeUndefined()
    })

    it('keeps all Docker participants aligned when E2E ports are customized', () => {
        const environment = dockerE2EEnvironment({
            ambient: {},
            envFile: {},
            envTestFile: {
                E2E_PG_PORT: '5543',
                E2E_S3_PORT: '8844',
                E2E_APP_PORT: '4201',
            },
        })

        expect(environment).toMatchObject({
            E2E_PG_PORT: '5543',
            E2E_S3_PORT: '8844',
            E2E_APP_PORT: '4201',
            DATABASE_URL: 'postgres://si:si@127.0.0.1:5543/si_test',
            S3_ENDPOINT: 'http://127.0.0.1:8844',
            S3_BROWSER_ENDPOINT: 'http://127.0.0.1:8844',
            E2E_BASE_URL: 'http://localhost:4201',
            PORT: '4201',
        })
    })
})
