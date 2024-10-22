import { SignedIn, SignedOut } from '@clerk/nextjs'
import { ResetPassword } from '@/components/reset-password'
import { Title } from '@mantine/core'
import { pageStyles } from '../page.css'

export default function ResetPasswordPage() {
    return (
        <div className={pageStyles}>
            <SignedIn>
                <Title order={2} c="red">
                    403 - Forbidden: Password reset is only available for signed out users
                </Title>
            </SignedIn>
            <SignedOut>
                <ResetPassword />
            </SignedOut>
        </div>
    )
}
