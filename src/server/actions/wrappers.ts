import logger from '@/lib/logger'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { AccessDeniedError } from '@/lib/errors'
import { UnknownKeysParam, z, ZodObject, ZodString, ZodTypeAny, type Schema } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { type SiUser, siUser } from '../db/queries'
import { db } from '@/database'

export { z } from 'zod'

export type ActionContext = {
    userId?: string | null
    orgSlug?: string | null
    user?: SiUser | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export async function actionContext() {
    const ctx = localStorageContext.getStore()
    if (!ctx) {
        const user = await siUser()
        const { sessionClaims } = await clerkAuth()
        return {
            user: user,
            userId: user.id,
            orgSlug: sessionClaims?.org_slug as string | undefined,
        }
    }
    return ctx as ActionContext
}

export async function getUserIdFromActionContext(): Promise<string> {
    const ctx = await actionContext()
    return ctx.userId ?? ''
}

export async function getOrgSlugFromActionContext(throwIfNotFound?: true): Promise<string>
export async function getOrgSlugFromActionContext(throwIfNotFound?: false): Promise<string | null>
export async function getOrgSlugFromActionContext(throwIfNotFound = true): Promise<string | null> {
    const ctx = await actionContext()
    if (!ctx.orgSlug && throwIfNotFound) throw new Error('user is not a member of organization?')
    return ctx.orgSlug || null
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
                    orgSlug: sessionClaims?.org_slug as string | undefined,
                    userId: user.id,
                    user: user,
                },
                async () => {
                    try {
                        if (schema && arg != null) schema.parse(arg)
                        const result = await func(arg)
                        resolve(result)
                    } catch (error) {
                        reject(error)
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
        if (ctx?.orgSlug !== CLERK_ADMIN_ORG_SLUG) {
            logger.error('Current orgSlug in adminAction:', ctx?.orgSlug)
            throw new AccessDeniedError('Only admins are allowed to perform this action')
        }
        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}

export function researcherAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const ctx = await actionContext()
        if (!ctx.userId || !ctx.user?.isResearcher) {
            throw new AccessDeniedError('Only researchers are allowed to perform this action')
        }
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
        const ctx = await actionContext()
        if (!ctx.orgSlug || ctx.orgSlug != arg?.orgSlug) {
            throw new AccessDeniedError(
                `Only members of ${arg?.orgSlug || '(missing slug)'} are allowed to perform this action`,
            )
        }
        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}

export function orgAdminAction<S extends OrgActionSchema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        if (!arg.orgSlug) {
            throw new Error('')
        }
        const { orgSlug, userId } = await actionContext()

        await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .select('orgUser.id')
            .where('org.slug', '=', orgSlug!) // we are wrapped by orgAction which ensures orgSlug is set
            .where('orgUser.userId', '=', userId!)
            .where('orgUser.isAdmin', '=', true)
            .executeTakeFirstOrThrow(() => new AccessDeniedError(`user is not an organization admin`))

        return await func(arg)
    }
    return orgAction(wrappedFunction, schema) as F
}

export async function checkMemberOfOrgWithSlug(orgSlug: string) {
    const userSlug = await getOrgSlugFromActionContext()
    if (userSlug != orgSlug) throw new AccessDeniedError(`not a member of ${orgSlug}`)
    return true
}
