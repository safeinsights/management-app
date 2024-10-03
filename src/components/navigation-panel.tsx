import NextLink from "next/link";
import type { NavLinkProps as MantineNavLinkProps } from "@mantine/core";
import { NavLink as MantineNavLink } from "@mantine/core";
import {
    IconChevronRight,
    IconClock,
    IconHomeStats,
    IconShieldLock,
    IconStar,
    IconZoomReset,
} from "@tabler/icons-react";

type NavLinkProps = MantineNavLinkProps & {
    to: string;
};

const NavLink: React.FC<NavLinkProps> = ({ to, ...props }) => {
    return (
        <NextLink passHref legacyBehavior href={to}>
            <MantineNavLink
                href={"#"}
                {...props}
                rightSection={
                    <IconChevronRight
                        size="0.8rem"
                        stroke={1.5}
                        className="mantine-rotate-rtl"
                    />
                }
            />
        </NextLink>
    );
};

export const NavigationPanel = () => {
    return (
        <>
            <NavLink
                to="/dashboard"
                label="Dashboard"
                leftSection={<IconHomeStats size="1rem" stroke={1.5} />}
            />
            <NavLink
                to="/admin"
                label="Organizations"
                leftSection={<IconShieldLock size="1rem" stroke={1.5} />}
            />
            <NavLink
                to="/signup"
                label="Sign up"
                leftSection={<IconStar size="1rem" stroke={1.5} />}
            />

            <NavLink
                to="/timer"
                label="Time restricted"
                leftSection={<IconClock size="1rem" stroke={1.5} />}
            />

            <NavLink
                to="/reset-password"
                label="Reset Password"
                leftSection={<IconZoomReset size="1rem" stroke={1.5} />}
            />
        </>
    );
};
