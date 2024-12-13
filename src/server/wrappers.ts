import { localStorageContext } from './context'
import { memberFromAuthToken } from './member-from-auth-token'
import { NextResponse } from 'next/server'

export * from './context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrappedFunc = (..._: any[]) => Promise<any>

export function wrapApiMemberAction<F extends WrappedFunc>(func: F): F {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedFunction = async (...args: any[]): Promise<any> => {
         
        // if we're called nested inside the stack from an earlier call
        // we don't bother creating a new context

        const existingStore = localStorageContext.getStore()
        if (existingStore?.member) {
            return await func(...args)
        }

        const member = await memberFromAuthToken()
        if (!member) {
            // return 404
            return new NextResponse(JSON.stringify({ error: 'Invalid or expired token' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const result = await new Promise<ReturnType<F>>((resolve, reject) => {
            localStorageContext.run(
                {
                    member,
                },
                async () => {
                    try {
                        const result = await func(...args)
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
