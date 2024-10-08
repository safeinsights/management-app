import {
    SignInButton,
    SignedIn,
    SignedOut,
    UserButton,
    OrganizationSwitcher,
} from "@clerk/nextjs";
import { Group } from "@mantine/core";

export const NavAuthMenu = () => {
    return (
        <>
            <SignedOut>
                <SignInButton />
            </SignedOut>

            <SignedIn>
                <Group>
                    <OrganizationSwitcher />
                    <UserButton />
                </Group>
            </SignedIn>
        </>
    );
};
