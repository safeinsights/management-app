import fs from 'fs'
import path from 'path'
import { signIn } from './auth'
import { DEPLOYED_ROLES } from './env'
import { authFileFor, expect, test as setup } from './fixtures'

// Signs every role in through the real form once and saves the sessions the specs restore. Runs
// as its own project so a failing sign-in, the likeliest failure on a new environment, keeps its trace.
setup('sign in every role', async ({ browser, target, accounts }) => {
    for (const role of DEPLOYED_ROLES) {
        const context = await browser.newContext()
        try {
            const page = await context.newPage()
            await signIn(page, accounts[role])
            const file = authFileFor(target, role)
            fs.mkdirSync(path.dirname(file), { recursive: true })
            await context.storageState({ path: file })
            expect(fs.existsSync(file)).toBe(true)
        } finally {
            await context.close()
        }
    }
})
