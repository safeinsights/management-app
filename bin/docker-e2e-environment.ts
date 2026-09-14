import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from 'dotenv'

const DEFAULT_CLERK_PUBLISHABLE_KEY = 'pk_test_ZHVtbXktZm9yLWUyZS5jbGVyay5hY2NvdW50cy5kZXYk'

type DockerE2EEnvironmentOptions = {
    ambient?: Record<string, string | undefined>
    envFile?: Record<string, string>
    envTestFile?: Record<string, string>
}

function readEnvironmentFile(path: string): Record<string, string> {
    return existsSync(path) ? parse(readFileSync(path)) : {}
}

function port(value: string | undefined, fallback: string, name: string): string {
    const selected = value || fallback
    const number = Number(selected)
    if (!Number.isInteger(number) || number < 1 || number > 65535) {
        throw new Error(`${name} must be an integer between 1 and 65535`)
    }
    return selected
}

export function dockerE2EEnvironment({
    ambient = process.env,
    envFile = readEnvironmentFile('.env'),
    envTestFile = readEnvironmentFile('.env.test'),
}: DockerE2EEnvironmentOptions = {}): Record<string, string | undefined> {
    const environment = { ...ambient, ...envFile, ...envTestFile }
    const pgPort = port(environment.E2E_PG_PORT, '5433', 'E2E_PG_PORT')
    const s3Port = port(environment.E2E_S3_PORT, '8334', 'E2E_S3_PORT')
    const appPort = port(environment.E2E_APP_PORT, '4101', 'E2E_APP_PORT')

    Object.assign(environment, {
        E2E_MODE: 'docker',
        E2E_PG_PORT: pgPort,
        E2E_S3_PORT: s3Port,
        E2E_APP_PORT: appPort,
        COMPOSE_PROJECT_NAME: environment.COMPOSE_PROJECT_NAME || 'mgmt-app-e2e-local',
        DATABASE_URL: `postgres://si:si@127.0.0.1:${pgPort}/si_test`,
        S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
        S3_BROWSER_ENDPOINT: `http://127.0.0.1:${s3Port}`,
        AWS_ACCESS_KEY_ID: 'si-local-s3',
        AWS_SECRET_ACCESS_KEY: 'si-local-s3',
        AWS_REGION: 'us-east-1',
        BUCKET_NAME: 'mgmt-app-local',
        E2E_FAKE_CLERK: '1',
        E2E_BASE_URL: `http://localhost:${appPort}`,
        PORT: appPort,
        SINGLE_USER_EDITING: 't',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: DEFAULT_CLERK_PUBLISHABLE_KEY,
    })

    delete environment.CI
    delete environment.AWS_PROFILE
    delete environment.CLAUDE_API_KEY
    delete environment.DB_SECRET_ARN
    delete environment.SECRETS_ARN
    return environment
}

async function run() {
    const [command, ...args] = process.argv.slice(2)
    if (!command) throw new Error('docker-e2e-environment requires a command to run')

    const child = spawn(command, args, {
        env: dockerE2EEnvironment() as NodeJS.ProcessEnv,
        stdio: 'inherit',
    })
    const forward = (signal: NodeJS.Signals) => child.kill(signal)
    process.once('SIGINT', forward)
    process.once('SIGTERM', forward)

    child.once('error', (error) => {
        throw error
    })
    child.once('exit', (code, signal) => {
        process.removeListener('SIGINT', forward)
        process.removeListener('SIGTERM', forward)
        process.exitCode = code ?? (signal ? 128 : 1)
    })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await run()
}
