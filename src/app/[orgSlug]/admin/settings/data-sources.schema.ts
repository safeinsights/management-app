import { z } from 'zod'

const dataSourceFieldsSchema = z.object({
    name: z.string().nonempty(),
    description: z.string().optional().or(z.literal('')),
    documentationUrl: z.string().url().optional().or(z.literal('')),
    codeEnvIds: z.array(z.string().uuid()).nonempty(),
})

export const createOrgDataSourceSchema = dataSourceFieldsSchema

export const editOrgDataSourceSchema = dataSourceFieldsSchema
