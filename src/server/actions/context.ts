import { AsyncLocalStorage } from 'node:async_hooks'

export type ActionContext = {
    userId?: string | null
    orgSlug?: string | null
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export function actionContext() {
    return localStorageContext.getStore()
}
