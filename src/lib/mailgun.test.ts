import { describe, it, expect, vi } from 'vitest'
import { sendWelcomeEmail } from './mailgun'

describe('Mailgun Service', () => {
    it('should not send email when MAILGUN_API_KEY is not set', async () => {
        vi.stubEnv('MAILGUN_API_KEY', '')
        const consoleSpy = vi.spyOn(console, 'warn')

        await sendWelcomeEmail('test@example.com', 'John Doe')

        expect(consoleSpy).toHaveBeenCalledWith('Mailgun client is not initialized. Skipping email sending.')
    })
})
