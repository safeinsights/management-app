import logger from '@/lib/logger'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { UnknownKeysParam, z, ZodObject, ZodString, ZodTypeAny, type Schema } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { type SiUser, siUser } from '../db/queries'
import { db } from '@/database'
import { AccessDeniedError, ActionFailure } from '@/lib/errors'

export { ActionFailure, AccessDeniedError } from '@/lib/errors'
export { z } from 'zod'

export type ActionContextOrgInfo = {
    id: string
    slug: string
    isResearcher: boolean
    isStaff?: boolean
    isAdmin: boolean
    isReviewer: boolean
}

export type OptionalActionContextOrgInfo = Partial<ActionContextOrgInfo>

export type ActionContext = {
    user: SiUser | Partial<SiUser>
    org: OptionalActionContextOrgInfo
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export async function actionContext() {
    const ctx = localStorageContext.getStore()
    if (!ctx) {
        const user = await siUser()
        const { sessionClaims } = await clerkAuth()
        return {
            user: user,
            org: {
                slug: sessionClaims?.org_slug as string | undefined,
            },
        } as ActionContext
    }
    return ctx as ActionContext
}

type ActionOrgContext = {
    user: SiUser
    org: ActionContextOrgInfo
}

export async function orgActionContext(): Promise<ActionOrgContext> {
    const ctx = await actionContext()
    if (!ctx?.org?.id) {
        throw new Error('not called from inside an org action')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ctx as any as ActionOrgContext
}

export async function getUserIdFromActionContext(): Promise<string> {
    const ctx = await actionContext()
    return ctx.user.id ?? ''
}

export async function getOrgInfoFromActionContext(throwIfNotFound?: true): Promise<ActionContextOrgInfo>
export async function getOrgInfoFromActionContext(throwIfNotFound?: false): Promise<OptionalActionContextOrgInfo>
export async function getOrgInfoFromActionContext(
    throwIfNotFound = true,
): Promise<OptionalActionContextOrgInfo | ActionContextOrgInfo> {
    const ctx = await actionContext()
    if (!ctx.org?.slug && throwIfNotFound) throw new AccessDeniedError('user is not a member of organization?')
    return ctx.org
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrappedFunc<S extends Schema> = (arg: z.infer<S>) => Promise<any>

export function anonAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        if (schema && arg != null) schema.parse(arg)

        return await func(arg)
    }
    return wrappedFunction as F
}

export function userAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const auth = await clerkAuth()
        const { sessionClaims } = auth || {}

        const user = await siUser()

        const result = await new Promise<ReturnType<F>>((resolve, reject) => {
            localStorageContext.run(
                {
                    user: user,
                    org: {
                        slug: sessionClaims?.org_slug as string | undefined,
                    },
                } as ActionContext,
                async () => {
                    try {
                        if (schema && arg != null) schema.parse(arg)
                        const result = await func(arg)
                        resolve(result)
                    } catch (error) {
                        if (error instanceof z.ZodError) {
                            const fieldErrors = error.flatten().fieldErrors
                            const sanitizedErrors: Record<string, string> = {}
                            for (const key in fieldErrors) {
                                if (fieldErrors[key]) {
                                    sanitizedErrors[key] = (fieldErrors[key] as string[]).join(', ')
                                }
                            }
                            reject(new ActionFailure(sanitizedErrors))
                        } else {
                            reject(error)
                        }
                    }
                },
            )
        })

        return result
    }

    // Type assertion needed to maintain the original function signature
    return wrappedFunction as F
}

export function adminAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const ctx = await actionContext()
        const auth = await clerkAuth()
        const { orgSlug } = auth || {}
        if (orgSlug !== CLERK_ADMIN_ORG_SLUG) {
            logger.error('Current orgSlug in adminAction:', ctx?.org.slug)
            throw new AccessDeniedError('Only admins are allowed to perform this action')
        }
        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}

// researcherAction is almost the same as orgAction, except orgSlug is optional
// if i'ts not present it checks that the user is a researcher in at least one org
export function researcherAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const ctx = await actionContext()

        const orgInfo = await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .select(['org.id', 'org.slug', 'isResearcher', 'isAdmin', 'isReviewer'])
            .where((eb) => {
                const filters = []
                filters.push(eb('orgUser.isResearcher', '=', true))
                filters.push(eb('orgUser.userId', '=', ctx.user?.id || ''))
                if (arg?.orgSlug) {
                    filters.push(eb('org.slug', '=', arg.orgSlug))
                }
                return eb.and(filters)
            })
            .executeTakeFirstOrThrow(() => new AccessDeniedError(`user is not a researcher`))

        Object.assign(ctx, { org: orgInfo })

        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}

export type WithOrgSlug = {
    orgSlug: ZodString
} & {
    [k: string]: ZodTypeAny
}

export type OrgActionSchema = ZodObject<WithOrgSlug, UnknownKeysParam, ZodTypeAny>

export function orgAction<S extends OrgActionSchema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        if (!arg.orgSlug) throw new AccessDeniedError(`'orgSlug' property not present`)
        const orgSlug = arg.orgSlug as string
        const ctx = await actionContext()
        const { sessionClaims } = await clerkAuth()
        // // SI staff user is admin on everything
        if (sessionClaims?.org_slug == CLERK_ADMIN_ORG_SLUG) {
            const org = await db
                .selectFrom('org')
                .select('id')
                .where('slug', '=', orgSlug)
                .executeTakeFirstOrThrow(
                    () => new ActionFailure({ org: `Target organization ${orgSlug} not found for admin operation.` }),
                )
            Object.assign(ctx, {
                org: {
                    id: org.id,
                    isResearcher: true,
                    isReviewer: true,
                    isAdmin: true,
                    slug: orgSlug,
                    isStaff: true,
                } as ActionContextOrgInfo,
            })
        } else {
            const orgInfo = await db
                .selectFrom('orgUser')
                .innerJoin('org', 'org.id', 'orgUser.orgId')
                .select(['org.id', 'org.slug', 'isResearcher', 'isAdmin', 'isReviewer'])
                .where('org.slug', '=', orgSlug) // we are wrapped by orgAction which ensures orgSlug is set
                .where('orgUser.userId', '=', ctx.user?.id || '')
                .executeTakeFirstOrThrow(
                    () => new AccessDeniedError(`user is not an member of organization ${arg.orgSlug}`),
                )

            Object.assign(ctx, { org: orgInfo })
        }
        return await func(arg)
    }

    return userAction(wrappedFunction, schema) as F
}

export function orgAdminAction<S extends OrgActionSchema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const { org } = await actionContext()
        if (!org.isAdmin) {
            throw new AccessDeniedError(`user is not an admin of organization ${arg.orgSlug}`)
        }
        return await func(arg)
    }
    return orgAction(wrappedFunction, schema) as F
}

export async function checkMemberOfOrgWithSlug(orgSlug: string) {
    const org = await getOrgInfoFromActionContext()
    if (!org.isStaff && org.slug != orgSlug) throw new AccessDeniedError(`not a member of ${orgSlug}`)
    return true
}
