import { db, type DBExecutor } from '@/database'
import logger from '@/lib/logger'
import { PROD_ENV } from './config'

export type UserSyncAttrs = {
    clerkId: string
    firstName: string
    lastName: string
    email: string
}

export type SyncResult = {
    id: string
    emailConflictResolved?: {
        previousUserId: string
        email: string
    }
}

/**
 * Synchronizes user attributes from Clerk to the database.
 * Handles email conflicts differently based on environment:
 * - Production: throws an exception
 * - Non-production: reassigns the old account to the new clerkId
 *
 * @param attrs - User attributes from Clerk
 * @param executor - Database executor (transaction or connection)
 * @returns The user ID and any conflict resolution info
 */
export async function syncUserToDatabase(attrs: UserSyncAttrs, executor: DBExecutor): Promise<SyncResult> {
    // First check if user exists by clerkId (stable identifier)
    const existingByClerkId = await executor
        .selectFrom('user')
        .select('id')
        .where('clerkId', '=', attrs.clerkId)
        .executeTakeFirst()

    if (existingByClerkId) {
        // User exists - update their info
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

    // User not found by clerkId - need to create
    // Check for email conflict first (case-insensitive)
    const existingByEmail = await executor
        .selectFrom('user')
        .select(['id', 'clerkId'])
        .where((eb) => eb(eb.fn('lower', ['email']), '=', attrs.email.toLowerCase()))
        .executeTakeFirst()

    if (existingByEmail) {
        // Email conflict - another user has this email
        if (PROD_ENV) {
            throw new Error(
                `Email conflict during user sync: email ${attrs.email} belongs to user ${existingByEmail.id} ` +
                    `(clerkId: ${existingByEmail.clerkId}), but new clerkId ${attrs.clerkId} is claiming it.`,
            )
        }

        // Non-production: reassign the old account to the new clerkId
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

    // Create the new user
    const user = await executor.insertInto('user').values(attrs).returning(['id']).executeTakeFirstOrThrow()

    return {
        id: user.id,
    }
}

/**
 * Wrapper that handles the transaction and post-sync callbacks.
 *
 * @param attrs - User attributes from Clerk
 * @param onConflictResolved - Optional callback when email conflict is resolved
 * @returns The user ID and any conflict resolution info
 */
export async function syncUserToDatabaseWithConflictResolution(
    attrs: UserSyncAttrs,
    onConflictResolved?: (previousUserId: string) => Promise<void>,
): Promise<SyncResult> {
    const result = await db.transaction().execute(async (trx) => {
        return syncUserToDatabase(attrs, trx)
    })

    // If we resolved an email conflict, call the callback
    if (result.emailConflictResolved && onConflictResolved) {
        try {
            await onConflictResolved(result.emailConflictResolved.previousUserId)
        } catch (error) {
            // Log but don't fail - the user might not exist in Clerk anymore
            logger.warn(
                `Failed to handle conflict resolution callback for user ${result.emailConflictResolved.previousUserId}: ${error}`,
            )
        }
    }

    return result
}
