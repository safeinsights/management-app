import { db, type DBExecutor } from '@/database'
import logger from '@/lib/logger'
import { PROD_ENV } from './config'

export type UserSyncAttrs = {
    clerkId: string
    firstName: string
    lastName: string
    email: string
    metadataUserId?: string
}

export type SyncResult = {
    id: string
    emailConflictResolved?: {
        previousUserId: string
        email: string
    }
}

// An email conflict throws in production; elsewhere the old account moves to the new clerkId.
export async function syncUserToDatabase(attrs: UserSyncAttrs, executor: DBExecutor): Promise<SyncResult> {
    const existingByClerkId = await executor
        .selectFrom('user')
        .select('id')
        .where('clerkId', '=', attrs.clerkId)
        .executeTakeFirst()

    if (existingByClerkId) {
        await executor
            .updateTable('user')
            .set({
                firstName: attrs.firstName,
                lastName: attrs.lastName,
                email: attrs.email,
            })
            .where('id', '=', existingByClerkId.id)
            .execute()
        return { id: existingByClerkId.id }
    }

    if (!PROD_ENV && attrs.metadataUserId) {
        const existingByMetadataId = await executor
            .selectFrom('user')
            .select(['id', 'clerkId'])
            .where('id', '=', attrs.metadataUserId)
            .executeTakeFirst()

        if (existingByMetadataId) {
            logger.info(
                `Matched user ${existingByMetadataId.id} via publicMetadata userId. ` +
                    `Reassigning from clerkId ${existingByMetadataId.clerkId} to ${attrs.clerkId}.`,
            )

            await executor
                .updateTable('user')
                .set({
                    clerkId: attrs.clerkId,
                    firstName: attrs.firstName,
                    lastName: attrs.lastName,
                    email: attrs.email,
                })
                .where('id', '=', existingByMetadataId.id)
                .execute()

            return { id: existingByMetadataId.id }
        }
    }

    const existingByEmail = await executor
        .selectFrom('user')
        .select(['id', 'clerkId'])
        .where((eb) => eb(eb.fn('lower', ['email']), '=', attrs.email.toLowerCase()))
        .executeTakeFirst()

    if (existingByEmail) {
        if (PROD_ENV) {
            throw new Error(
                `Email conflict during user sync: email ${attrs.email} belongs to user ${existingByEmail.id} ` +
                    `(clerkId: ${existingByEmail.clerkId}), but new clerkId ${attrs.clerkId} is claiming it.`,
            )
        }

        logger.warn(
            `Email conflict during user sync: email ${attrs.email} belongs to user ${existingByEmail.id} ` +
                `(clerkId: ${existingByEmail.clerkId}), but new clerkId ${attrs.clerkId} is claiming it. ` +
                `Reassigning old account to new clerkId.`,
        )

        await executor
            .updateTable('user')
            .set({
                clerkId: attrs.clerkId,
                firstName: attrs.firstName,
                lastName: attrs.lastName,
            })
            .where('id', '=', existingByEmail.id)
            .execute()

        return {
            id: existingByEmail.id,
            emailConflictResolved: {
                previousUserId: existingByEmail.id,
                email: attrs.email,
            },
        }
    }

    const user = await executor
        .insertInto('user')
        .values({
            clerkId: attrs.clerkId,
            firstName: attrs.firstName,
            lastName: attrs.lastName,
            email: attrs.email,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow()

    return {
        id: user.id,
    }
}

export async function syncUserToDatabaseWithConflictResolution(
    attrs: UserSyncAttrs,
    onConflictResolved?: (previousUserId: string) => Promise<void>,
): Promise<SyncResult> {
    const result = await db.transaction().execute(async (trx) => {
        return syncUserToDatabase(attrs, trx)
    })

    if (result.emailConflictResolved && onConflictResolved) {
        try {
            await onConflictResolved(result.emailConflictResolved.previousUserId)
        } catch (error) {
            // The user might not exist in Clerk any more, so this must not fail the sync.
            logger.warn(
                `Failed to handle conflict resolution callback for user ${result.emailConflictResolved.previousUserId}: ${error}`,
            )
        }
    }

    return result
}
