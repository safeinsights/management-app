#!/bin/bash

fetch_and_export() {
  local secret_arn="$1"
  local secret_json
  secret_json=$(curl -sX POST "https://secretsmanager.us-east-1.amazonaws.com" \
    --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
    --aws-sigv4 "aws:amz:us-east-1:secretsmanager" \
    --header "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
    --header "X-Amz-Target: secretsmanager.GetSecretValue" \
    --header "Content-Type: application/x-amz-json-1.1" \
    --data '{ "SecretId": "'"${secret_arn}"'" }')

  eval $(node -e "const data = JSON.parse(JSON.parse(process.argv[1]).SecretString);
    Object.entries(data).forEach(([key, value]) =>
      console.log(\`export \${key}='\${value}'\`));" "$secret_json")

}

fetch_and_export "${SECRETS_ARN}"
fetch_and_export "${DB_SECRET_ARN}"

export PORT=8080

node server.js
