import { createSafeActionClient } from 'next-safe-action'

export { z } from 'zod'

export const defineAction = createSafeActionClient()
