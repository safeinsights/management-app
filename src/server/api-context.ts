import { AsyncLocalStorage } from 'node:async_hooks'
import { AccessDeniedError } from '@/lib/errors'
import { SessionUser } from '@/lib/types'
import { Org } from '@/schema/org'

export type ActionContext = {
    org?: Org | null
    user?: SessionUser | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export function actionContext() {
    return localStorageContext.getStore()
}

export function apiRequestingOrg() {
    const org = localStorageContext.getStore()?.org
    if (!org) throw new AccessDeniedError({ org: 'was not found in api context' })

    return org
}

export function wasCalledFromAPI() {
    return Boolean(localStorageContext.getStore())
}
