import { ZodType, ZodError, z } from 'zod'
import { type AppAbility, PermissionsActionSubjectMap, PermissionsSubjectToObjectMap, subject as subjectWithArgs } from '@/lib/permissions'

import { type UserSession, type IsUnknown } from '@/lib/types'
import { sessionFromClerk, type UserSessionWithAbility } from '../clerk'
import * as Sentry from '@sentry/nextjs'
import { AccessDeniedError, ActionFailure } from '@/lib/errors'
import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@/lib/logger'
import { omit } from 'remeda'
import { db, type DBExecutor } from '@/database'

type MiddlewareFn<Args, PrevCtx, NewCtx> = (args: Args, ctx: PrevCtx) => NewCtx | Promise<NewCtx>
type HandlerFn<Ctx, Res> = (ctx: Ctx) => Promise<Res>

export { ActionFailure, z }

export type ActionContext = {
    session?: UserSessionWithAbility
    db: DBExecutor
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
    Ctx extends { session?: UserSessionWithAbility; db: DBExecutor; params?: Args } = { session?: UserSessionWithAbility; db: DBExecutor; params?: Args },
> {
    // hold onto your schema, middleware list, and final handler
    private schema?: ZodType<Args>
    private middlewareFns: MiddlewareFn<Args, unknown, unknown>[] = []
    private protector?: {
        action: Parameters<AppAbility['can']>[0]
        subject: Parameters<AppAbility['can']>[1]
    }
    private options: ActionOptions

    static get db() {
        const ctx = localStorageContext.getStore()
        return ctx?.db || db
    }

    constructor(private actionName: string, options: ActionOptions = {}) {
        this.options = options
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params<S extends ZodType<any, any, any>>(schema: S) {
        this.schema = schema as ZodType<Args>
        // reset middleware when you change the schema
        this.middlewareFns = []
        // now this builder “becomes” one typed with new Args and empty ctx
        return this as unknown as Action<z.infer<S>, { session?: UserSessionWithAbility; db: DBExecutor }>
    }

    /**
     * Add one async middleware piece.
     * Each middleware can read the validated `args` and the current `ctx`,
     * and must return a partial context object that gets merged in.
     */
    middleware<NewCtx>(fn: MiddlewareFn<Args, Ctx, NewCtx>) {
        this.middlewareFns.push(fn as MiddlewareFn<Args, unknown, unknown>)
        // the new context type is the old Ctx & NewCtx
        return this as unknown as Action<Args, Ctx & NewCtx>
    }

    /**
     * Add a protection function that runs before the handler.
     * The protect function can validate permissions, throw errors, etc.
     */
    requireAbilityTo<A extends keyof PermissionsActionSubjectMap, S extends PermissionsActionSubjectMap[A]>(
        action: A,
        subject: S & ((Args & Omit<Ctx, 'session'>) extends PermissionsSubjectToObjectMap[S] ? S : never),
    ) {
        this.protector = { action, subject }
        return this as unknown as Action<Args, Ctx & { session: UserSession }>
    }

    /**
     * Finalize with a handler. Returns a callable action:
     *   (args) => Promise<ReturnType>
     *
     * It will:
     *  1. parse & validate `args` against your Zod schema
     *  2. start with session and db context
     *  3. run all middleware in order, merging their returned objects into `ctx`
     *  4. add params to context
     *  5. call your handler(ctx)
     */
    handler<Res>(handlerFn: HandlerFn<Ctx & { params: Args }, Res>) {
        const schema = this.schema
        const middlewareFns = [...this.middlewareFns]

        // build the final action function
        const action = async (raw: unknown): Promise<Res> => {
            // 1) validate
            let args: Args
            if (schema) {
                try {
                    args = schema.parse(raw)
                } catch (error) {
                    if (error instanceof ZodError) {
                        const fieldErrors = error.flatten().fieldErrors
                        const sanitizedErrors: Record<string, string> = {}
                        for (const key in fieldErrors) {
                            if (fieldErrors[key]) {
                                sanitizedErrors[key] = (fieldErrors[key] as string[]).join(', ')
                            }
                        }
                        throw new ActionFailure(sanitizedErrors)
                    }
                    throw error
                }
            } else {
                args = raw as Args
            }
            // 2) run middleware chain and set up database connection
            const session = await sessionFromClerk()

            // Function to execute with either transaction or regular db
            const executeWithDb = async (dbConn: DBExecutor): Promise<Res> => {
                let ctx = { session, db: dbConn } as Ctx
                for (const mw of middlewareFns) {
                    const more = await Promise.resolve(mw(args, ctx))
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ctx = { ...ctx, ...(more as any[]) }
                }

                // Add params to context after middleware
                const contextWithParams = { ...ctx, params: args } as Ctx & { params: Args }

                // 3) check protection if defined
                if (this.protector) {
                    if (!session) {
                        throw new ActionFailure({ user: `is not logged in when calling ${this.actionName}` })
                    }
                    const { action, subject } = this.protector
                    const abilityArgs = { ...args, ...omit(ctx, ['session']) }
                    const abilitySubject = subjectWithArgs(subject as string, abilityArgs)

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (!session.ability.can(action, abilitySubject as any)) {
                        const msg =
                            `in ${this.actionName} action; cannot ${action} ${subject}.\n` +
                            `input: ${JSON.stringify(abilityArgs || {}, null, 2)}\n` +
                            `session: ${JSON.stringify(session.team, null, 2)}\n`
                        logger.error(msg)
                        throw new ActionFailure({ permission_denied: msg })
                    }
                }

                if (session) {
                    Sentry.setUser({ id: session.user.id })
                    Sentry.setTag('team', session.team.slug)
                }

                // 4) run handler inside localStorage context
                return await new Promise<Res>((resolve, reject) => {
                    localStorageContext.run({ session: ctx.session, db: ctx.db }, () => {
                        try {
                            const result = handlerFn(contextWithParams)
                            resolve(result)
                        } catch (error) {
                            Sentry.captureException(error)
                            reject(error)
                        }
                    })
                })
            }

            // Choose between transaction and regular db
            if (this.options.performsMutations) {
                return await db.transaction().execute(executeWithDb)
            } else {
                return await executeWithDb(db)
            }
        }

        return action as IsUnknown<Args> extends true ? () => Promise<Res> : (args: Args) => Promise<Res>
    }
}
