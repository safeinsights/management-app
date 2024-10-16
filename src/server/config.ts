export const DEV_ENV = !!process && process.env.NODE_ENV === 'development'

export const TEST_ENV = !!(process.env.CI || process.env.NODE_ENV === 'test')

export const PROD_ENV = process.env.NODE_ENV === 'production'

export const getUploadTmpDirectory = () => {
    return process.env.UPLOAD_TMP_DIRECTORY || '/tmp'
}
