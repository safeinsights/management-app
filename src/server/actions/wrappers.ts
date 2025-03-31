import logger from '@/lib/logger'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { AccessDeniedError, CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { z, type Schema } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { type SiUser, siUser } from '../db/queries'

export { z } from 'zod'

export type ActionContext = {
    userId?: string | null
    user?: SiUser | null
    orgSlug?: string | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export function actionContext() {
    return localStorageContext.getStore()
}

export function getUserIdFromActionContext(): string {
    const store = localStorageContext.getStore()
    return store?.userId ?? ''
}

export function getOrgSlugFromActionContext(): string {
    const store = localStorageContext.getStore()
    if (!store?.orgSlug) throw new Error('user is not a member of organization?')
    return store?.orgSlug
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
        const store = localStorageContext.getStore()
        if (store?.orgSlug !== CLERK_ADMIN_ORG_SLUG) {
            logger.error('Current orgSlug in adminAction:', store?.orgSlug)
            throw new AccessDeniedError('Only admins are allowed to perform this action')
        }
        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}

export function researcherAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const store = localStorageContext.getStore()

        if (!store?.userId) {
            throw new AccessDeniedError('Only researchers are allowed to perform this action')
        }
        // TODO: check siUser's isResearcher vs clerk session
        if (!store.orgSlug) {
            return func(arg)
        }
        throw new AccessDeniedError('Only researchers are allowed to perform this action')
    }
    return userAction(wrappedFunction, schema) as F
}

export function memberAction<S extends Schema, F extends WrappedFunc<S>>(func: F, schema?: S): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (arg: z.infer<S>): Promise<any> => {
        const store = localStorageContext.getStore()
        if (!store?.orgSlug) {
            throw new AccessDeniedError('Only members are allowed to perform this action')
        }

        return await func(arg)
    }
    return userAction(wrappedFunction, schema) as F
}
