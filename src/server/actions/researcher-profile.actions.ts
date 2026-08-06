'use server'

import { Action, z } from '@/server/actions/action'
import { updateClerkUserName } from '@/server/clerk'
import { positionSchema, educationSchema, personalInfoSchema, researchDetailsSchema } from '@/schema/researcher-profile'
import { throwNotFound } from '@/lib/errors'
import logger from '@/lib/logger'

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
                'researchInterests',
                'detailedPublicationsUrl',
                'featuredPublicationsUrls',
            ])
            .where('userId', '=', userId)
            .executeTakeFirstOrThrow()

        const positions = await db
            .selectFrom('researcherPosition')
            .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
            .where('userId', '=', userId)
            .orderBy('sortOrder', 'asc')
            .execute()

        return {
            user,
            profile,
            positions,
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

        // Ensure profile exists first (positions have FK to profile)
        await db
            .insertInto('researcherProfile')
            .values({ userId })
            .onConflict((oc) => oc.column('userId').doNothing())
            .execute()

        await db.deleteFrom('researcherPosition').where('userId', '=', userId).execute()

        if (params.positions.length > 0) {
            const rows = params.positions.map((p, idx) => ({
                userId,
                affiliation: p.affiliation,
                position: p.position,
                profileUrl: p.profileUrl || null,
                sortOrder: idx,
            }))
            await db.insertInto('researcherPosition').values(rows).execute()
        }

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

export const getResearcherProfileByUserIdAction = new Action('getResearcherProfileByUserIdAction')
    .params(z.object({ userId: z.string(), studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        // Deliberately excludes researcherId/piUserId: everything returned here is merged into
        // the CASL ability args, and requireAbilityTo echoes those args in its denial message —
        // including them would leak the study's real researcher/PI ids to unauthorized callers.
        const study = await db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('Study'))

        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { userId, studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['researcherId', 'piUserId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('Study'))

        // The study's view ability says nothing about whose profile is being requested, so without
        // this anyone able to view any single study could read every user's email and PII by
        // editing the userId in the URL. Only the two people the study actually names are exposed.
        // This must run after the view-Study check above: callers without access to the study get
        // only the generic CASL denial, never a distinguishable "not associated" answer that would
        // confirm whether an arbitrary user is the study's researcher or PI. The denial is returned
        // rather than thrown so id enumeration cannot flood Sentry (only thrown errors are
        // captured), and logged at info because warn/error console output is forwarded to Sentry.
        if (userId !== study.researcherId && userId !== study.piUserId) {
            const msg = `getResearcherProfileByUserIdAction: user ${userId} is not associated with study ${studyId}`
            logger.info(msg)
            return { error: { permission_denied: msg } }
        }

        const user = await db
            .selectFrom('user')
            .select(['id', 'firstName', 'lastName', 'email'])
            .where('id', '=', userId)
            .executeTakeFirst()

        if (!user) return null

        const profile = await db
            .selectFrom('researcherProfile')
            .select([
                'userId',
                'educationInstitution',
                'educationDegree',
                'educationFieldOfStudy',
                'educationIsCurrentlyPursuing',
                'researchInterests',
                'detailedPublicationsUrl',
                'featuredPublicationsUrls',
            ])
            .where('userId', '=', userId)
            .executeTakeFirst()

        if (!profile) return { user, profile: null, positions: [] }

        const positions = await db
            .selectFrom('researcherPosition')
            .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
            .where('userId', '=', userId)
            .orderBy('sortOrder', 'asc')
            .execute()

        return { user, profile, positions }
    })
