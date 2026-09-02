'use client'

import type { FC } from '@/common'
import { Paper, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

export const LegalPanel: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
    <Paper shadow="xs" p="xl">
        <Title order={3} mb="lg">
            {title}
        </Title>
        {children}
    </Paper>
)

// All three agreement labels pluralise with a bare 's'.
export const AgreementsEmptyState: FC<{ label: string }> = ({ label }) => (
    <Text ta="center">You have not acknowledged any {label}s yet</Text>
)
