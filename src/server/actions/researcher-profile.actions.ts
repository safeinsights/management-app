'use server'

import { Action, z } from '@/server/actions/action'
import { updateClerkUserName } from '@/server/clerk'
import type { Json } from '@/database/types'
import {
    positionSchema,
    educationSchema,
    personalInfoSchema,
    researchDetailsSchema,
} from '@/schema/researcher-profile'

const toJson = (value: unknown): Json => JSON.stringify(value) as unknown as Json

export const getResearcherProfileAction = new Action('getResearcherProfileAction')
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, db }) => {
        const userId = session.user.id

        // Ensure row exists so UI can treat missing profile as empty.
        await db
            .insertInto('researcherProfile')
            .values({ userId })
            .onConflict((oc) => oc.column('userId').doNothing())
            .execute()

        const user = await db
            .selectFrom('user')
            .select(['id', 'firstName', 'lastName', 'email'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        const profile = await db
            .selectFrom('researcherProfile')
            .select([
                'userId',
                'educationInstitution',
                'educationDegree',
                'educationFieldOfStudy',
                'educationIsCurrentlyPursuing',
                'positions',
                'researchInterests',
                'detailedPublicationsUrl',
                'featuredPublicationsUrls',
            ])
            .where('userId', '=', userId)
            .executeTakeFirstOrThrow()

        return {
            user,
            profile,
        }
    })

export const updatePersonalInfoAction = new Action('updatePersonalInfoAction', { performsMutations: true })
    .params(personalInfoSchema)
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, params, db }) => {
        const userId = session.user.id

        // Update Clerk first - if this fails, the database won't be updated
        await updateClerkUserName(userId, params.firstName, params.lastName)

        await db
            .updateTable('user')
            .set({ firstName: params.firstName, lastName: params.lastName })
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        return { success: true }
    })

export const updateEducationAction = new Action('updateEducationAction', { performsMutations: true })
    .params(educationSchema)
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, params, db }) => {
        const userId = session.user.id

        await db
            .insertInto('researcherProfile')
            .values({ userId })
            .onConflict((oc) => oc.column('userId').doNothing())
            .execute()

        await db
            .updateTable('researcherProfile')
            .set({
                educationInstitution: params.educationalInstitution,
                educationDegree: params.degree,
                educationFieldOfStudy: params.fieldOfStudy,
                educationIsCurrentlyPursuing: params.isCurrentlyPursuing,
            })
            .where('userId', '=', userId)
            .executeTakeFirstOrThrow()

        return { success: true }
    })

export const updatePositionsAction = new Action('updatePositionsAction', { performsMutations: true })
    .params(z.object({ positions: z.array(positionSchema) }))
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, params, db }) => {
        const userId = session.user.id

        await db
            .insertInto('researcherProfile')
            .values({ userId })
            .onConflict((oc) => oc.column('userId').doNothing())
            .execute()

        await db
            .updateTable('researcherProfile')
            .set({
                // Stored as JSONB
                positions: toJson(params.positions),
            })
            .where('userId', '=', userId)
            .executeTakeFirstOrThrow()

        return { success: true }
    })

export const updateResearchDetailsAction = new Action('updateResearchDetailsAction', { performsMutations: true })
    .params(researchDetailsSchema)
    .middleware(async ({ session }) => ({ id: session?.user.id }))
    .requireAbilityTo('update', 'User')
    .handler(async ({ session, params, db }) => {
        const userId = session.user.id

        await db
            .insertInto('researcherProfile')
            .values({ userId })
            .onConflict((oc) => oc.column('userId').doNothing())
            .execute()

        await db
            .updateTable('researcherProfile')
            .set({
                researchInterests: params.researchInterests,
                detailedPublicationsUrl: params.detailedPublicationsUrl,
                featuredPublicationsUrls: params.featuredPublicationsUrls,
            })
            .where('userId', '=', userId)
            .executeTakeFirstOrThrow()

        return { success: true }
    })
