import { AsyncLocalStorage } from 'node:async_hooks'
import { AccessDeniedError } from '@/lib/errors'
import { User } from '@/lib/types'
import { Member } from '@/schema/member'

export type ActionContext = {
    member?: Member | null
    user?: User | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export function actionContext() {
    return localStorageContext.getStore()
}

export function requestingMember() {
    const member = localStorageContext.getStore()?.member
    if (!member) throw new AccessDeniedError('No member in context')

    return member
}

export function requestingUser() {
    const user = localStorageContext.getStore()?.user
    if (!user) throw new AccessDeniedError('No user in context')

    return user
}

export function wasCalledFromAPI() {
    return Boolean(localStorageContext.getStore())
}
