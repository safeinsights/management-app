'use client'

import type { FC } from '@/common'
import type { OrgType } from '@/database/types'
import { legalDocumentTypeLabels, participationAgreementTypeForOrgType } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import { OrgStudyAgreements } from './org-study-agreements'
import { OrgParticipationAgreement } from './org-participation-agreement'

type Props = {
    orgSlug: string
    orgType: OrgType
}

// keepMounted={false} so the participation tab's query only runs once its panel is opened.
export const OrgLegalTabs: FC<Props> = ({ orgSlug, orgType }) => {
    const participationType = participationAgreementTypeForOrgType[orgType]

    return (
        <Tabs defaultValue="SLA" keepMounted={false}>
            <Tabs.List>
                <Tabs.Tab value="SLA">{legalDocumentTypeLabels.SLA}</Tabs.Tab>
                {/* The full name, unlike the SI-admin strip where five tabs compete for width. */}
                <Tabs.Tab value={participationType}>{legalDocumentTypeLabels[participationType]}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="SLA" pt="md">
                <OrgStudyAgreements orgSlug={orgSlug} orgType={orgType} />
            </Tabs.Panel>
            <Tabs.Panel value={participationType} pt="md">
                <OrgParticipationAgreement orgSlug={orgSlug} type={participationType} />
            </Tabs.Panel>
        </Tabs>
    )
}
