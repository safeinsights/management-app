'use client'

import type { FC } from '@/common'
import { useTypedSearchParams } from '@/lib/routes/hooks'
import { legalDocumentTypeLabels, legalDocumentTypeSchema } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import { z } from 'zod'
import { UserStudyAgreements } from './user-study-agreements'
import { UserParticipationAgreements } from './user-participation-agreements'
import { UserGlobalDocument } from './user-global-document'

// `?tab=` lets a link, such as the Terms of Service gate's, open the page on the document it names.
const useInitialTab = () => useTypedSearchParams(z.object({ tab: legalDocumentTypeSchema.catch('SLA') })).tab

// All five regardless of membership, so the strip's shape does not depend on the user's orgs.
// keepMounted={false} so each panel's query, and the two S3 reads behind tos/pn, wait for a click.
// Singular labels and 12px side padding, as in the design, fit all five tabs on one row of the 1036px
// content column. Neither alone is enough.

export const UserLegalTabs: FC = () => {
    const initialTab = useInitialTab()

    return (
        <Tabs defaultValue={initialTab} keepMounted={false}>
            <Tabs.List>
                <Tabs.Tab value="SLA" px="sm">
                    {legalDocumentTypeLabels.SLA}
                </Tabs.Tab>
                <Tabs.Tab value="DOPA" px="sm">
                    {legalDocumentTypeLabels.DOPA}
                </Tabs.Tab>
                <Tabs.Tab value="ROPA" px="sm">
                    {legalDocumentTypeLabels.ROPA}
                </Tabs.Tab>
                <Tabs.Tab value="TOS" px="sm">
                    {legalDocumentTypeLabels.TOS}
                </Tabs.Tab>
                <Tabs.Tab value="PN" px="sm">
                    {legalDocumentTypeLabels.PN}
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="SLA">
                <UserStudyAgreements />
            </Tabs.Panel>
            <Tabs.Panel value="DOPA">
                <UserParticipationAgreements type="DOPA" />
            </Tabs.Panel>
            <Tabs.Panel value="ROPA">
                <UserParticipationAgreements type="ROPA" />
            </Tabs.Panel>
            <Tabs.Panel value="TOS">
                <UserGlobalDocument type="TOS" />
            </Tabs.Panel>
            <Tabs.Panel value="PN">
                <UserGlobalDocument type="PN" />
            </Tabs.Panel>
        </Tabs>
    )
}
