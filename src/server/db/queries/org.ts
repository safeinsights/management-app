import { type DBExecutor, jsonArrayFrom } from '@/database'
import { currentDb } from '@/server/request-context'
import { OrgType } from '@/database/types'

export const getDataSourcesForOrg = async (orgId: string) => {
    return currentDb()
        .selectFrom('orgDataSource')
        .select((eb) => [
            'orgDataSource.id',
            'orgDataSource.name',
            'orgDataSource.description',
            jsonArrayFrom(
                eb
                    .selectFrom('orgDataSourceUrl')
                    .select(['orgDataSourceUrl.url', 'orgDataSourceUrl.description'])
                    .whereRef('orgDataSourceUrl.orgDataSourceId', '=', 'orgDataSource.id')
                    .orderBy('orgDataSourceUrl.createdAt', 'asc'),
            ).as('urls'),
        ])
        .where('orgDataSource.orgId', '=', orgId)
        .orderBy('orgDataSource.createdAt', 'asc')
        .execute()
}

export const getUsersForOrgId = async (orgId: string) => {
    return currentDb()
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

type OrgIdForSlug = { orgId: string; orgType: OrgType }

export async function findOrgIdBySlug(
    executor: DBExecutor,
    orgSlug: string,
    throwIfNotFound: true,
): Promise<OrgIdForSlug>
export async function findOrgIdBySlug(
    executor: DBExecutor,
    orgSlug: string,
    throwIfNotFound: false,
): Promise<OrgIdForSlug | undefined>
export async function findOrgIdBySlug(
    executor: DBExecutor,
    orgSlug: string,
    throwIfNotFound: boolean,
): Promise<OrgIdForSlug | undefined> {
    const query = executor.selectFrom('org').select(['id as orgId', 'type as orgType']).where('slug', '=', orgSlug)
    return throwIfNotFound ? await query.executeTakeFirstOrThrow() : await query.executeTakeFirst()
}

// Not throwing: an unknown slug must leave orgId ABSENT from the CASL subject so the mongo $in
// conditions fail CLOSED. Throwing would distinguish "no such org" from "not yours".
export const orgIdFromSlug = async ({ db, params: { orgSlug } }: { db: DBExecutor; params: { orgSlug: string } }) =>
    await findOrgIdBySlug(db, orgSlug, false)

// A claimed invite resumes email linking for its claimer only (OTTER-788), so re-sending it would
// hand a different owner of this address a dead link. Callers create a fresh invite instead.
export const findOpenInvite = async (db: DBExecutor, orgId: string, email: string) =>
    await db
        .selectFrom('pendingUser')
        .select(['id', 'isAdmin'])
        .where('email', '=', email)
        .where('orgId', '=', orgId)
        .where('claimedByUserId', 'is', null)
        .executeTakeFirst()
