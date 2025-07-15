'use server'

import { db } from '@/database'
import { isClerkApiError } from '@/lib/errors'
import { anonAction, z, ActionFailure, userAction, actionContext } from '@/server/actions/wrappers'
import { findOrCreateClerkOrganization } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { clerkClient } from '@clerk/nextjs/server'
import { v7 as uuidv7 } from 'uuid'

export const onPendingUserLoginAction = userAction(async (inviteId) => {
    const { user } = await actionContext()
    await db
        .updateTable('pendingUser')
        .set({ claimedByUserId: user.id })
        .where('id', '=', inviteId)
        .executeTakeFirstOrThrow()
}, z.string())

export const onCreateAccountAction = anonAction(
    async ({ inviteId, form }) => {
        const clerk = await clerkClient()
        let clerkUserId = ''

        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const userId = uuidv7()

        const org = await db
            .selectFrom('org')
            .select(['org.slug', 'name'])
            .where('id', '=', invite.orgId)
            .executeTakeFirstOrThrow()

        try {
            const clerkUser = await clerk.users.createUser({
                firstName: form.firstName,
                lastName: form.lastName,
                emailAddress: [invite.email],
                password: form.password,
                publicMetadata: {
                    // mark user when created inside a github action so it can be later cleaned up after test run
                    createdByCIJobId: process.env.GITHUB_JOB,
                    userId,
                    orgs: [
                        {
                            slug: org.slug,
                            isAdmin: false,
                            isResearcher: invite.isResearcher,
                            isReviewer: invite.isReviewer,
                        },
                    ],
                },
            })
            clerkUserId = clerkUser.id
        } catch (error) {
            if (isClerkApiError(error)) {
                const emailExistsError = error.errors.find((e) => e.code === 'form_identifier_exists')
                if (emailExistsError) {
                    throw new ActionFailure({
                        form: 'This email address is already associated with an existing account. Please log in to continue.',
                    })
                }

                const pwnedError = error.errors.find((e) => e.code === 'form_password_pwned')
                if (pwnedError) {
                    throw new ActionFailure({
                        form: 'This password has recently been added to the compromised password database, putting your account at risk. Please change your password to continue.',
                    })
                }
                // the user is an admin, they can see the clerk error
                throw new ActionFailure({ password: error.errors[0].message })
            }
            throw error
        }

        if (invite.isReviewer) {
            const clerkOrg = await findOrCreateClerkOrganization({ slug: org.slug, name: org.name })
            await clerk.organizations.createOrganizationMembership({
                organizationId: clerkOrg.id,
                userId: clerkUserId,
                role: 'org:member',
            })
        }

        return await db.transaction().execute(async (trx) => {
            const siUser = await trx
                .insertInto('user')
                .values({
                    id: userId,
                    clerkId: clerkUserId,
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: invite.email,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            await trx
                .insertInto('orgUser')
                .values({
                    userId: siUser.id,
                    orgId: invite.orgId,
                    isResearcher: invite.isResearcher,
                    isReviewer: invite.isReviewer,
                    isAdmin: false,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            onUserAcceptInvite(siUser.id)

            return { success: true }
        })
    },
    z.object({
        inviteId: z.string(),
        form: z.object({
            firstName: z.string(),
            lastName: z.string(),
            password: z.string(),
            confirmPassword: z.string(),
        }),
    }),
)
