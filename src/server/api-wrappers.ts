import { NextResponse } from 'next/server'
import { localStorageContext } from './api-context'
import { orgFromAuthToken } from './org-from-auth-token'
import { captureException } from '@sentry/nextjs'

export * from './api-context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrappedFunc = (..._: any[]) => Promise<any>

export function wrapApiOrgAction<F extends WrappedFunc>(func: F): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (...args: any[]): Promise<any> => {
        // if we're called nested inside the stack from an earlier call
        // we don't bother creating a new context

        const existingStore = localStorageContext.getStore()
        if (existingStore?.org) {
            return await func(...args)
        }

        let org
        try {
            org = await orgFromAuthToken()
        } catch (e) {
            return new NextResponse(JSON.stringify({ error: `Token error: ${e}` }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const result = await new Promise<ReturnType<F>>((resolve, reject) => {
            localStorageContext.run(
                {
                    org,
                },
                async () => {
                    try {
                        const result = await func(...args)
                        resolve(result)
                    } catch (error) {
                        captureException(error)
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
