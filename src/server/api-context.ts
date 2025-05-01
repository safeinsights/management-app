import { AsyncLocalStorage } from 'node:async_hooks'
import { AccessDeniedError } from '@/lib/errors'
import { User } from '@/lib/types'
import { Org } from '@/schema/org'

export type ActionContext = {
    org?: Org | null
    user?: User | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export function actionContext() {
    return localStorageContext.getStore()
}

export function apiRequestingOrg() {
    const org = localStorageContext.getStore()?.org
    if (!org) throw new AccessDeniedError('No org in context')

    return org
}

export function wasCalledFromAPI() {
    return Boolean(localStorageContext.getStore())
}
