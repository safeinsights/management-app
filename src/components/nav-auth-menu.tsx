import { SignedIn, SignedOut, UserButton, OrganizationSwitcher } from '@clerk/nextjs'
import { Group } from '@mantine/core'
import { SigninLink } from './signin-link'

export const NavAuthMenu = () => {
    return (
        <>
            <SignedOut>
                <SigninLink />
            </SignedOut>

            <SignedIn>
                <Group>
                    <OrganizationSwitcher />
                    <UserButton />
                </Group>
            </SignedIn>
        </>
    )
}
