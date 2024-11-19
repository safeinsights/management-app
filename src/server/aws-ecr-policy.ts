import { type AwsIAMPolicy, AwsEcrActions as Action } from 'aws-iam-policy-types'
import { ENCLAVE_AWS_ACCOUNT_NUMBERS } from './config'

export const getECRPolicy = (awsAccountId: string): AwsIAMPolicy => ({
    Version: '2012-10-17',
    Statement: [
        {
            Action: [
                Action.BatchCheckLayerAvailability,
                Action.BatchGetImage,
                Action.DescribeImages,
                Action.GetDownloadUrlForLayer,
                Action.GetAuthorizationToken,
                Action.ListTagsForResource,
                Action.GetDownloadUrlForLayer,
            ],
            Principal: {
                Service: ['ecs-tasks.amazonaws.com', 'lambda.amazonaws.com'],
                AWS: ENCLAVE_AWS_ACCOUNT_NUMBERS.map((acct) => `arn:aws:iam::${acct}:root`).concat(
                    `arn:aws:iam::${awsAccountId}:root`,
                ),
            },
            Effect: 'Allow',
            Sid: 'AllowEnclaveECSTaskToPullImages',
        },
        {
            Action: [
                Action.BatchCheckLayerAvailability,
                Action.BatchGetImage,
                Action.DescribeImages,
                Action.GetDownloadUrlForLayer,
                Action.GetAuthorizationToken,
                Action.ListTagsForResource,

                Action.InitiateLayerUpload,
                Action.UploadLayerPart,
                Action.CompleteLayerUpload,
                Action.PutImage,
            ],
            Principal: {
                AWS: `arn:aws:iam::${awsAccountId}:root`,
            },
            Effect: 'Allow',
            Sid: 'AllowEnclaveECSTaskToPullImages',
        },
    ],
})
