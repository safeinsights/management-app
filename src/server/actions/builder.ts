import { ZodType, ZodError, z, ZodObject } from 'zod'
import { defineAbilityFor, type AppAbility } from '@/lib/permissions'
import { subject as subjectWithArgs } from '@casl/ability'
import { type UserSession } from '@/lib/types'
import { loadSession } from '../session'
import { ActionFailure } from './wrappers'
//
// ——— Types for middleware & handlers —————————————————————————————
//
type MiddlewareFn<Args, PrevCtx, NewCtx> = (args: Args, ctx: PrevCtx) => Promise<NewCtx>

type HandlerFn<Args, Ctx, Res> = (args: Args, ctx: Ctx) => Promise<Res>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProtectorTranslateFn<Args> = (args: Args) => any

const passthroughTanslate = <Args>(args: Args) => args as unknown as Record<string, unknown>
//
// ——— ActionBuilder ———————————————————————————————————————————————
//
export class Action<Args = unknown, Ctx = object> {
    // hold onto your schema, middleware list, and final handler
    private schema?: ZodType<Args, any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    private middlewareFns: MiddlewareFn<Args, any, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
    private protector?: {
        action: Parameters<AppAbility['can']>[0]
        subject: Parameters<AppAbility['can']>[1]
        translate?: ProtectorTranslateFn<Args>
    }

    constructor(private actionName: string) {}
    /**
     * Attach a Zod schema to infer your `Args` type
     */
    params<S extends ZodObject<any, any, any, any, any>>(schema: S) {
         

        this.schema = schema as ZodType<Args, any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.middlewareFns.push(fn as any)
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
        translate?: ProtectorTranslateFn<Args>,
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
        // capture for closure
        const schema = this.schema
        const middlewareFns = [...this.middlewareFns]
        //const protectFn = this.protectFn;

        // build the final action function
        const action = async (raw: unknown): Promise<Res> => {
            // 1) validate
            let args: Args
            if (schema) {
                try {
                    args = schema.parse(raw as any) // eslint-disable-line @typescript-eslint/no-explicit-any
                } catch (err) {
                    if (err instanceof ZodError) {
                        throw new Error(`Invalid input: ${err.message} in action ${this.actionName}`)
                    }
                    throw err
                }
            } else {
                args = raw as Args
            }
            // 2) run middleware chain
            let ctx = {} as Ctx
            for (const mw of middlewareFns) {
                const more = await mw(args, ctx)
                ctx = { ...ctx, ...more }
            }

            // 3) check protection if defined
            if (this.protector) {
                const session = await loadSession()
                if (!session) throw new ActionFailure({ user: `is not logged in when calling ${this.actionName}` })
                const ability = defineAbilityFor(session)
                const { action, subject, translate = passthroughTanslate } = this.protector
                console.log({ action, subject, translate, args })
                 


                const abilitySubject = args ? subjectWithArgs(subject as any, translate(args)) : subject

                if (!ability.can(action, abilitySubject)) {
                    throw new ActionFailure({ user: `${session.user.id} cannot ${action} ${subject}` })
                }
                ctx = { ...ctx, session }
            }

            // 4) run handler
            return handlerFn(args, ctx)
        }

        return action as (args: Args) => Promise<Res>
    }
}
