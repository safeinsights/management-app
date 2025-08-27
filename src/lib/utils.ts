import { isActionError, type ActionResponse, errorToString } from '@/lib/errors'

/**
 * Helper function to handle action results.
 * If the result is an error, throws it as an Error.
 * Otherwise, returns the result with proper typing.
 *
 * @example
 * const result = actionResult(await someAction({ param: 'value' }))
 * // result is fully typed and errors are automatically thrown
 */
export function actionResult<T>(result: ActionResponse<T>): T {
    if (isActionError(result)) {
        throw new Error(errorToString(result))
    }
    return result
}
