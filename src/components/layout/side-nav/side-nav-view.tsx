import { externalNavLinks, type NavOrg } from '@/lib/nav/side-nav'
import { Routes } from '@/lib/routes'
import Link from 'next/link'
import { SafeInsightsLogo } from '../svg/si-logo'
import { NavRow } from './nav-row'
import { OrgGroup } from './org-group'
import styles from './side-nav.module.css'

const LOGO_WIDTH = 152
const LOGO_HEIGHT = 33

// Session-free so it renders in isolation: the container resolves the orgs and the current path.
export type SideNavViewProps = {
    orgs: NavOrg[]
    focusedOrgSlug: string | null
    pathname: string
}

export const SideNavView: React.FC<SideNavViewProps> = ({ orgs, focusedOrgSlug, pathname }) => {
    const links = externalNavLinks(orgs)
    const isOnMyStudies = pathname === Routes.dashboard

    return (
        <nav aria-label="Main" className={styles.nav}>
            <Link href={Routes.dashboard} className={styles.logoWrapper} aria-label="SafeInsights, go to My studies">
                <SafeInsightsLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} />
            </Link>
            <ul className={styles.list}>
                <li className={styles.group}>
                    <NavRow label="My studies" url={Routes.dashboard} icon="house" isCurrent={isOnMyStudies} />
                </li>
                {orgs.map((org) => (
                    <OrgGroup key={org.id} org={org} focusedOrgSlug={focusedOrgSlug} pathname={pathname} />
                ))}
                <li className={styles.group}>
                    <ul className={styles.list}>
                        {links.map((link) => (
                            <li key={link.url}>
                                <NavRow {...link} />
                            </li>
                        ))}
                    </ul>
                </li>
            </ul>
        </nav>
    )
}
