'use client'

import type { FC } from '@/common'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Tabs } from '@mantine/core'
import LegalUpload from './legal-upload'
import { StudyLevelAgreements } from './sla/study-level-agreements'

// keepMounted={false} so a tab's queries only run once its panel is opened.
export const LegalTabs: FC = () => (
    <Tabs defaultValue="tos" keepMounted={false}>
        <Tabs.List>
            <Tabs.Tab value="tos">{legalDocumentTypeLabels.tos}</Tabs.Tab>
            <Tabs.Tab value="pn">{legalDocumentTypeLabels.pn}</Tabs.Tab>
            <Tabs.Tab value="sla">Study Level Agreements</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tos" pt="md">
            <LegalUpload doctype="tos" />
        </Tabs.Panel>
        <Tabs.Panel value="pn" pt="md">
            <LegalUpload doctype="pn" />
        </Tabs.Panel>
        <Tabs.Panel value="sla" pt="md">
            <StudyLevelAgreements />
        </Tabs.Panel>
    </Tabs>
)
