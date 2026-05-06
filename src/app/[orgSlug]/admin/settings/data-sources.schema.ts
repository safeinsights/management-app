import { z } from 'zod'

const dataSourceUrlSchema = z.object({
    id: z.uuid().optional(),
    url: z.url(),
    description: z.string().trim().nonempty(),
})

const dataSourceFieldsSchema = z.object({
    name: z.string().nonempty(),
    description: z.string().optional().or(z.literal('')),
    urls: z.array(dataSourceUrlSchema),
})

const newUrlFieldsSchema = z.object({
    newUrl: z.string(),
    newUrlDescription: z.string(),
})

export const createOrgDataSourceSchema = dataSourceFieldsSchema

export const editOrgDataSourceSchema = dataSourceFieldsSchema

export const dataSourceFormSchema = z.object({
    ...dataSourceFieldsSchema.shape,
    ...newUrlFieldsSchema.shape,
})
