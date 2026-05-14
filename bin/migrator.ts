import { Migrator, Kysely, PostgresDialect, type Migration, CamelCasePlugin } from 'kysely'
import { Pool } from 'pg'
import { Handler } from 'aws-lambda'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { sprintf } from 'sprintf-js'
import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'

function prepDirectory(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        const items = fs.readdirSync(dirPath)
        for (const item of items) {
            const itemPath = path.join(dirPath, item)
            const stats = fs.lstatSync(itemPath)
            if (stats.isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true })
            } else {
                fs.unlinkSync(itemPath)
            }
        }
    } else {
        fs.mkdirSync(dirPath, { recursive: true })
    }
}

const streamToFile = async (stream: Readable, filePath: string) => {
    return new Promise<void>((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath)
        stream
            .pipe(fileStream)
            .on('finish', () => resolve())
            .on('error', reject)
    })
}

const streamToString = (stream: Readable) =>
    new Promise<string>((resolve, reject) => {
        const chunks: Uint8Array[] = []
        stream.on('data', (chunk) => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

type Migrations = Record<string, Migration>
type DBManifest = {
    seeds: string[]
    migrations: string[]
}
type Seeds = Record<string, { seed(db: Kysely<unknown>): Promise<void> }>

const databaseURL = async () => {
    const secretsClient = new SecretsManagerClient()
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }))
    if (!data.SecretString) throw new Error(`failed to fetch db secrets from: ${process.env.DB_SECRET_ARN}`)
    const db = JSON.parse(data.SecretString)
    return `postgres://${db.username}:${db.password}@${db.host}/${db.dbname}`
}

async function downloadFiles<T extends Record<string, unknown>>(Bucket: string, type: string, names: string[]) {
    const files: any = {} // eslint-disable-line @typescript-eslint/no-explicit-any

    prepDirectory(`/tmp/${type}`)

    const s3 = new S3Client()
    for (const fileName of names) {
        const data = await s3.send(
            new GetObjectCommand({
                Bucket,
                Key: `builds/management-app/db/${type}/${fileName}`,
            }),
        )
        if (!data.Body) throw new Error(`no body returned for ${fileName}`)
        const filePath = path.join(`/tmp/${type}`, fileName)
        await streamToFile(data.Body as Readable, filePath)
        const code = await import(filePath)
        files[fileName.split('_')[0]] = code
    }

    return files as T
}

async function downloadManifest(Bucket: string, commitId: string) {
    const s3 = new S3Client()
    const resp = await s3.send(
        new GetObjectCommand({
            Bucket,
            Key: `builds/management-app/${commitId}/db.manifest.json`,
        }),
    )
    if (!resp.Body) throw new Error(`no body returned for ${commitId}/db.manifest.json`)
    return JSON.parse(await streamToString(resp.Body as Readable)) as DBManifest
}

type HandlerPayload = {
    bucketName: string
    releaseSHA: string
}

export const migrate: Handler<HandlerPayload, string[]> = async (params, __, callback) => {
    const bucketName = params.bucketName || 'si-mgmt-app-build'
    const dialect = new PostgresDialect({
        pool: new Pool({
            connectionString: await databaseURL(),
            max: 1, // will only be used here
            ssl: { rejectUnauthorized: false },
        }),
    })

    const db = new Kysely<unknown>({ dialect, plugins: [new CamelCasePlugin()] })
    const manifest = await downloadManifest(bucketName, params.releaseSHA)

    const definitions = await downloadFiles<Migrations>(bucketName, 'migrations', manifest.migrations)

    const migrations: Migrations = {}
    const files = Object.keys(definitions).sort()

    for (const file of files) {
        migrations[file] = definitions[file]
    }

    const migrator = new Migrator({
        db,
        allowUnorderedMigrations: true, // needed to allow dev to merge branches https://github.com/kysely-org/kysely/issues/697#issuecomment-2103078857
        provider: {
            async getMigrations() {
                return migrations
            },
        },
    })

    const { error, results } = await migrator.migrateToLatest()

    const output: string[] = []

    results?.forEach((it) => {
        let msg = ''

        if (it.status === 'Success') {
            msg = '✓ success'
        } else if (it.status === 'NotExecuted') {
            msg = '⛌ skipped'
        } else if (it.status === 'Error') {
            msg = '⚠ failure'
        }
        const status = sprintf('%-20s%s', it.migrationName, msg)
        output.push(status)
    })
    if (!error) {
        const seeds = await downloadFiles<Seeds>(bucketName, 'seeds', manifest.seeds)
        for (const key of Object.keys(seeds).sort()) {
            await seeds[key].seed(db)
        }
    }
    callback(error ? String(error) : null, output)

    await db.destroy()

    return output
}
