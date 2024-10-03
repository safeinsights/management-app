import { AppShell, Group } from "@mantine/core";
import { SafeInsightsLogo } from "./si-logo";
import { NavAuthMenu } from "./nav-auth-menu";
import Link from "next/link";
import { NavigationPanel } from "./navigation-panel";
import { Notifications } from "@mantine/notifications";

import "@mantine/notifications/styles.css";

type Props = {
    children: React.ReactNode;
};

export function AppLayout({ children }: Props) {
    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: 300,
                breakpoint: "sm",
            }}
            padding="md"
        >
            <Notifications />
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Link href="/">
                        <SafeInsightsLogo height={30} />
                    </Link>
                    <NavAuthMenu />
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md">
                <NavigationPanel />
            </AppShell.Navbar>
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
