#!/usr/bin/env bash
awslocal s3 mb s3://mgmt-app-local
awslocal s3api put-bucket-cors --bucket mgmt-app-local --cors-configuration file:///etc/localstack/init/ready.d/cors-config.json
