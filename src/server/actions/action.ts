import { ZodType, ZodError, z, ZodObject } from 'zod'
import { defineAbilityFor, type AppAbility } from '@/lib/permissions'
import { subject as subjectWithArgs } from '@casl/ability'
import { type UserSession, type IsUnknown } from '@/lib/types'
import { loadSession } from '../session'
import * as Sentry from '@sentry/nextjs'
import { AccessDeniedError, ActionFailure } from '@/lib/errors'
import { AsyncLocalStorage } from 'node:async_hooks'

type MiddlewareFn<Args, PrevCtx, NewCtx> = (args: Args, ctx: PrevCtx) => Promise<NewCtx>
type HandlerFn<Args, Ctx, Res> = (args: Args, ctx: Ctx) => Promise<Res>
type ProtectorTranslateFn<Args, Ctx> = (args: Args, ctx: Ctx & { session: UserSession }) => Record<string, unknown>

export { ActionFailure, z }

export type ActionContext = {
    session: UserSession
}

export const localStorageContext = new AsyncLocalStorage<ActionContext>()


export async function currentSession<T extends boolean>(
    throwIfNotFound?: T
): Promise<T extends true ? UserSession : UserSession | null> {
    const ctx = localStorageContext.getStore()

    if (!ctx?.session && throwIfNotFound) {
        throw new AccessDeniedError({ user: `not present` })
    }

    return ctx?.session as UserSession
}



const passthroughTranslate = <Args>(args: Args) => args

export class Action<Args = unknown, Ctx = object> {
    // hold onto your schema, middleware list, and final handler
    private schema?: ZodType<Args>
    private middlewareFns: MiddlewareFn<Args, unknown, unknown>[] = []
    private protector?: {
        action: Parameters<AppAbility['can']>[0]
        subject: Parameters<AppAbility['can']>[1]
        translate?: ProtectorTranslateFn<Args, Ctx>
    }

    constructor(private actionName: string) {}

    params<S extends ZodType<any, any, any>>(schema: S) {


        this.schema = schema as ZodType<Args>
        // reset middleware when you change the schema
        this.middlewareFns = []
        // now this builder “becomes” one typed with new Args and empty ctx
        return this as unknown as Action<z.infer<S>, object>
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
    requireAbilityTo(
        action: Parameters<AppAbility['can']>[0],
        subject: Parameters<AppAbility['can']>[1],
        translate?: ProtectorTranslateFn<Args, Ctx>,
    ) {
        this.protector = { action, subject, translate }
        return this as unknown as Action<Args, Ctx & { session: UserSession }>
    }

    /**
     * Finalize with a handler. Returns a callable action:
     *   (args) => Promise<ReturnType>
     *
     * It will:
     *  1. parse & validate `args` against your Zod schema
     *  2. run all middleware in order, merging their returned objects into `ctx`
     *  3. call your handler(args, ctx)
     */
    handler<Res>(handlerFn: HandlerFn<Args, Ctx, Res>) {
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
            // 2) run middleware chain
            const session = await loadSession()
            //            ctx = { ...ctx, session } as Ctx
            let ctx = { session } as Ctx & { session: UserSession }
            for (const mw of middlewareFns) {
                const more = await mw(args, ctx)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ctx = { ...ctx, ...more as any[] }
            }


            // 3) check protection if defined
            if (this.protector) {
                if (!session) throw new ActionFailure({ user: `is not logged in when calling ${this.actionName}` })
                const ability = defineAbilityFor(session)
                const { action, subject, translate = passthroughTranslate } = this.protector

                const abilitySubject = args ? subjectWithArgs(subject as string, translate(args, ctx)) : subject
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (!ability.can(action as any, abilitySubject as any)) {
                    throw new ActionFailure({ user: `${session.user.id} cannot ${action} ${subject}` })
                }
            }

            // 4) run handler inside localStorage context
            const result = await new Promise<Res>((resolve, reject) => {

                localStorageContext.run({ session: ctx.session }, () => {
                    try {
                        const result = handlerFn(args, ctx)
                        resolve(result)
                    } catch (error) {
                        Sentry.captureException(error)
                        reject(error)
                    }
                })
            })

            return result

        }

        return action as IsUnknown<Args> extends true ? () => Promise<Res> : (args: Args) => Promise<Res>
    }
}
