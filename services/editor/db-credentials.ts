// Resilient DB credential resolution for the long-running editor service.
//
// The service authenticates to Postgres with a password fetched from Secrets
// Manager. A `ManagementAppStack` deploy can reset that password while the
// editor task keeps running, after which every pooled connection authenticates
// with the now-stale password and fails with `28P01`. Restarting the task was
// the only recovery (see OTTER-626).
//
// This module caches the resolved secret but, on a connection-time auth
// failure, re-fetches the secret and reports whether the password actually
// changed. The caller can then rebuild its pool against the fresh credentials
// and retry — self-healing without a restart, and without hammering Secrets
// Manager on every healthy connection.

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import {
    type DbSecret,
    dbConnectionString,
    fetchSecretJson,
    RDS_SSL,
    type SecretFetcher,
} from '../../src/lib/db-connection.ts'

export type ResolvedDbSecret = DbSecret

export type DbPoolSettings = {
    connectionString: string
    ssl?: typeof RDS_SSL
}

export function poolSettingsFromSecret(secret: ResolvedDbSecret): DbPoolSettings {
    return { connectionString: dbConnectionString(secret), ssl: RDS_SSL }
}

const fetchSecret = (arn: string, client: SecretFetcher) => fetchSecretJson<ResolvedDbSecret>(arn, client)

// Holds the most-recently-resolved DB secret and knows how to refresh it from
// Secrets Manager when a connection rejects the cached password.
export class DbCredentials {
    private secret: ResolvedDbSecret
    private readonly arn: string
    private readonly client: SecretFetcher

    private constructor(secret: ResolvedDbSecret, arn: string, client: SecretFetcher) {
        this.secret = secret
        this.arn = arn
        this.client = client
    }

    static async resolve(arn: string, client: SecretFetcher): Promise<DbCredentials> {
        const secret = await fetchSecret(arn, client)
        return new DbCredentials(secret, arn, client)
    }

    poolSettings(): DbPoolSettings {
        return poolSettingsFromSecret(this.secret)
    }

    current(): ResolvedDbSecret {
        return this.secret
    }

    // Re-fetch the secret. Returns true when the password differs from the
    // cached one (i.e. a retry against fresh credentials is worthwhile) and
    // updates the cache; returns false when the password is unchanged, so the
    // caller does not loop re-fetching an identical secret on a non-credential
    // failure.
    async refresh(): Promise<boolean> {
        const next = await fetchSecret(this.arn, this.client)
        if (next.password === this.secret.password) return false
        this.secret = next
        return true
    }
}

// Resolve the pool source. Mirrors src/server/config.ts:databaseURL() — accept
// DATABASE_URL directly for local/dev, otherwise resolve the RDS-managed
// secret. Returns a `DATABASE_URL` source (static, no refresh) or a `secret`
// source backed by DbCredentials (refreshable).
export type DbSource =
    | { kind: 'connectionString'; settings: DbPoolSettings }
    | { kind: 'secret'; credentials: DbCredentials }

export async function resolveDbSource(
    env: { DATABASE_URL?: string; DB_SECRET_ARN?: string },
    client: SecretFetcher,
): Promise<DbSource> {
    if (env.DATABASE_URL) {
        return { kind: 'connectionString', settings: { connectionString: env.DATABASE_URL } }
    }
    const arn = env.DB_SECRET_ARN
    if (!arn) throw new Error('DATABASE_URL or DB_SECRET_ARN is required')
    const credentials = await DbCredentials.resolve(arn, client)
    return { kind: 'secret', credentials }
}

export function createSecretsClient(): SecretFetcher {
    return new SecretsManagerClient({}) as unknown as SecretFetcher
}
