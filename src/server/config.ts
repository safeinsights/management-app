export const DEV_ENV = !!process && process.env.NODE_ENV === 'development'

export const TEST_ENV = !!(process.env.CI || process.env.NODE_ENV === 'test')

export const PROD_ENV = process.env.NODE_ENV === 'production'

export const getUploadTmpDirectory = () => process.env.UPLOAD_TMP_DIRECTORY || '/tmp'

export const ALWAYS_CREATE_ECR = process.env.ALWAYS_CREATE_ECR === 't'

export const USING_CONTAINER_REGISTRY = ALWAYS_CREATE_ECR || PROD_ENV

export const USING_S3_STORAGE = process.env.USE_S3_STORAGE === 't' || PROD_ENV

// TODO: when enclave is deployed, change default to be false when ENV is not present
export const SIMULATE_RESULTS_UPLOAD = process.env.SIMULATE_RESULTS_UPLOAD !== 'f' || !PROD_ENV
