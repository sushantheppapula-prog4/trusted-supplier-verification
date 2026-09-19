# Secure invoice upload infrastructure

This milestone adds an authenticated presigned-upload path without changing the existing Cognito user pool or app client.

## Deploy

The infrastructure is defined in `template.yaml` and is intended for AWS SAM. From the repository root, with an AWS CLI/SAM-authenticated environment:

```bash
cd lambda && npm install --omit=dev && cd ..
sam build
sam deploy --guided \
  --parameter-overrides \
    CognitoUserPoolId=ap-south-1_S3dpK1Sf7 \
    CognitoUserPoolClientId=qssp7vfvpaqprpmi1r01a7egj \
    AllowedOrigin=http://localhost:3000
```

Use the `UploadApiEndpoint` output as `NEXT_PUBLIC_UPLOAD_API_URL` for the Next.js app. For a deployed frontend, set `AllowedOrigin` to its exact HTTPS origin and update the Cognito app client's callback/sign-out URLs in the existing Cognito configuration; do not create a replacement user pool or client.

## Request flow

1. The signed-in browser obtains the current Cognito access token through Amplify.
2. The browser sends the filename, MIME type, and byte size to `POST /upload-url` with `Authorization: Bearer <access-token>`.
3. API Gateway validates the JWT against the existing Cognito user pool and app client.
4. Lambda reads the authenticated `sub` claim, validates the file metadata, generates a random user-scoped object key, and returns a five-minute presigned S3 PUT URL.
5. The browser uploads the bytes directly to S3 with the exact content type.

## Security controls

The bucket has public access blocks, bucket-owner-enforced object ownership, AES-256 default encryption, versioning, and a retained deletion policy. Lambda has only `s3:PutObject` permission under `invoices/*`; it cannot list, read, or delete objects. Object keys use `invoices/<Cognito sub>/<UUID>/<sanitized filename>`. The browser never receives AWS credentials. API Gateway's JWT authorizer rejects unauthenticated requests before Lambda runs.

The client enforces the same allowlist and 10 MB limit as Lambda. Lambda remains the authority, so bypassing the client does not bypass validation.

## Validation checklist

After deployment, verify with an authenticated browser session that a PDF/JPG/JPEG/PNG uploads successfully, the object exists under the user prefix, and `aws s3api head-object` shows `ServerSideEncryption: AES256`. Confirm the bucket's public access block is enabled and that an unauthenticated `curl -X POST "$NEXT_PUBLIC_UPLOAD_API_URL"` receives `401`/`403`. Confirm an unsupported extension and a file over 10 MB are rejected by the UI and API. Finally run `npm run lint` and `npm run build`.
