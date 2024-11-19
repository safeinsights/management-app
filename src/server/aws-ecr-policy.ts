import { type AwsIAMPolicy, AwsEcrActions as Action } from 'aws-iam-policy-types'
import { ENCLAVE_AWS_ACCOUNT_NUMBERS } from './config'

export const EcrPolicy: AwsIAMPolicy = {
    Version: '2012-10-17',
    Statement: [
        {
            Condition: {
                StringEquals: {
                    'ecr:ResourceTag/Target': 'si:analysis',
                },
            },
            Action: [
                Action.BatchCheckLayerAvailability,
                Action.BatchGetImage,
                Action.DescribeImages,
                Action.GetAuthorizationToken,
                Action.ListTagsForResource,
                Action.GetDownloadUrlForLayer,
            ],
            Principal: {
                Service: ['ecs-tasks.amazonaws.com'],
                AWS: ENCLAVE_AWS_ACCOUNT_NUMBERS.map((acct) => `arn:aws:iam::${acct}:root`),
            },
            Effect: 'Allow',
            Sid: 'AllowEnclaveECSTaskToPullImages',
        },
    ],
}
