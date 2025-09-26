import { ZodType, ZodError, z } from 'zod'
import { PermissionsActionSubjectMap, PermissionsSubjectToObjectMap, toRecord } from '@/lib/permissions'
import * as Sentry from '@sentry/nextjs'
import { type UserSession, type IsUnknown } from '@/lib/types'
import { sessionFromClerk, type UserSessionWithAbility } from '../clerk'

import { AccessDeniedError, ActionFailure, type ActionResponse } from '@/lib/errors'
import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@/lib/logger'
import { omit } from 'remeda'
import { db, type DBExecutor } from '@/database'
import { setSentryFromSession } from '@/lib/sentry'

type MiddlewareFn<PrevCtx, NewCtx> = (ctx: PrevCtx) => Promise<NewCtx>
type HandlerFn<Ctx, Res> = (ctx: Ctx) => Promise<Res>

export { ActionFailure, z }

export type ActionContext<Args = unknown> = {
    session?: UserSessionWithAbility
    db: DBExecutor
    params?: Args
}

export type ActionOptions = {
    performsMutations?: boolean
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()

export async function currentSession<T extends boolean>(
    throwIfNotFound?: T,
): Promise<T extends true ? UserSession : UserSession | null> {
    const ctx = localStorageContext.getStore()

    if (!ctx?.session && throwIfNotFound) {
        throw new AccessDeniedError({ user: `not present` })
    }

    return ctx?.session as UserSession
}

export class Action<
    Args = unknown,
    Ctx extends ActionContext = {
        session?: UserSessionWithAbility
        db: DBExecutor
        params?: Args
    },
> {
    // hold onto your schema, middleware list, and final handler
    private schema?: ZodType<Args>
    private middlewareFns: MiddlewareFn<unknown, unknown>[] = []
    private options: ActionOptions

    static get db() {
        const ctx = localStorageContext.getStore()
        return ctx?.db || db
    }

    constructor(
        private actionName: string,
        options: ActionOptions = {},
    ) {
        this.options = options
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params<S extends ZodType<any, any, any>>(schema: S) {
        this.schema = schema as ZodType<Args>
        // now this builder “becomes” one typed with new Args and empty ctx
        return this as unknown as Action<z.infer<S>, { session?: UserSessionWithAbility; db: DBExecutor }>
    }

    /**
     * Add one async middleware piece.
     * Each middleware can read the validated `args` and the current `ctx`,
     * and must return a partial context object that gets merged in.
     */
    middleware<NewCtx>(fn: MiddlewareFn<Ctx & { params: Args }, NewCtx>) {
        this.middlewareFns.push(fn as MiddlewareFn<unknown, unknown>)
        // the new context type is the old Ctx & NewCtx
        return this as unknown as Action<Args, Ctx & NewCtx>
    }

    /**
     * Add a protection function that runs before the handler.
     * Automatically adds internal middleware to check permissions.
     */
    requireAbilityTo<A extends keyof PermissionsActionSubjectMap, S extends PermissionsActionSubjectMap[A]>(
        action: A,
        subject: S & (Args & Omit<Ctx, 'session'> extends PermissionsSubjectToObjectMap[S] ? S : never),
    ) {
        type PermCheckArgs = Ctx & { params: Args }
        // Add internal middleware that performs the permission check
        const permCheck: MiddlewareFn<PermCheckArgs, PermCheckArgs> = async (ctx: PermCheckArgs) => {
            const session = ctx.session
            if (!session) {
                throw new ActionFailure({ user: `is not logged in when calling ${this.actionName}` })
            }

            const abilityArgs = { ...ctx.params, ...omit(ctx, ['session', 'db']) }
            const abilitySubject = toRecord(String(subject), abilityArgs)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!session.ability.can(action, abilitySubject as any)) {
                const msg =
                    `in ${this.actionName} action; cannot ${String(action)} ${String(subject)}.\n` +
                    `input: ${JSON.stringify(abilityArgs || {}, null, 2)}\n` +
                    `session: ${JSON.stringify(omit(session, ['ability']), null, 2)}\n`
                logger.error(msg)
                throw new ActionFailure({ permission_denied: msg })
            }

            // Return empty object since this middleware only performs validation
            return ctx
        }
        this.middlewareFns.push(permCheck as MiddlewareFn<unknown, unknown>)
        return this as unknown as Action<Args, Ctx & { session: UserSession }>
    }

    /**
     * Finalize with a handler. Returns a callable action:
     *   (args) => Promise<ReturnType>
     *
     * It will:
     *  1. parse & validate `args` against your Zod schema
     *  2. start with session and db context
     *  3. run all middleware in order (including permission checks), merging their returned objects into `ctx`
     *  4. call your handler(ctx)
     */
    handler<Res>(handlerFn: HandlerFn<Ctx & { params: Args }, Res>) {
        const schema = this.schema
        const middlewareFns = [...this.middlewareFns]

        // build the final action function
        const action = async (raw: unknown): Promise<ActionResponse<Res>> => {
            try {
                // 1) validate
                let args: Args
                if (schema) {
                    try {
                        args = schema.parse(raw)
                    } catch (error) {
                        if (error instanceof ZodError) {
                            const fieldErrors = error.flatten().fieldErrors as Record<string, string[] | undefined>
                            const sanitizedErrors: Record<string, string> = {}
                            for (const key in fieldErrors) {
                                if (fieldErrors[key] && fieldErrors[key] !== undefined) {
                                    sanitizedErrors[key] = (fieldErrors[key] as string[]).join(', ')
                                }
                            }
                            return { error: `Validation error: ${JSON.stringify(sanitizedErrors)}` }
                        }
                        return { error: error instanceof Error ? error.message : 'Unknown validation error' }
                    }
                } else {
                    args = raw as Args
                }
                // 2) run middleware chain and set up database connection
                const session = await sessionFromClerk()

                // Function to execute with either transaction or regular db
                const execute = async (dbConn: DBExecutor): Promise<Res> => {
                    let ctx = { params: args, session, db: dbConn } as Ctx & { params: Args }

                    return localStorageContext.run(ctx, async () => {
                        // Run all middleware in order, including any permission checking middleware
                        for (const mw of middlewareFns) {
                            const more = await mw(ctx)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ctx = { ...ctx, ...(more as any[]) }
                        }

                        if (session) {
                            setSentryFromSession(session)
                        }

                        return handlerFn(ctx)
                    })
                }

                // Choose between transaction and regular db
                let result: Res

                if (this.options.performsMutations) {
                    result = await db.transaction().execute(execute)
                } else {
                    result = await execute(db)
                }

                return result
            } catch (error) {
                Sentry.captureException(error)

                // Handle specific error types
                if (error instanceof ActionFailure) {
                    return { error: error.error }
                }
                if (error instanceof AccessDeniedError) {
                    return { error: `Access denied: ${error.message}` }
                }

                // Generic error handling
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
                return { error: errorMessage }
            }
        }

        return action as IsUnknown<Args> extends true
            ? () => Promise<ActionResponse<Res>>
            : (args: Args) => Promise<ActionResponse<Res>>
    }
}
