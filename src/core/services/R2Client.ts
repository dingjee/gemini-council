import { S3Client } from "@aws-sdk/client-s3";

const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const BUCKET_NAME = process.env.BUCKET_NAME;

if (!R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_ENDPOINT || !BUCKET_NAME) {
    throw new Error("Missing required R2 environment variables");
}

export const r2Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY,
    },
    signatureVersion: "v4",
});

export const getBucketName = (): string => BUCKET_NAME;
