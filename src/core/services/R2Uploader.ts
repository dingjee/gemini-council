import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, getBucketName } from "./R2Client";

const MIME_TYPE_MAP: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
};

export function detectMimeType(fileName: string, fallbackMime?: string): string {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
    return MIME_TYPE_MAP[ext] || fallbackMime || "application/octet-stream";
}

export function generateUniqueKey(originalFileName: string): string {
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const ext = originalFileName.substring(originalFileName.lastIndexOf("."));
    return `images/${timestamp}-${uuid}${ext}`;
}

export interface UploadResult {
    objectKey: string;
    presignedUrl: string;
    publicUrl: string;
}

export interface UploadOptions {
    fileName: string;
    mimeType?: string;
    data: ArrayBuffer | Uint8Array | Blob | string;
}

export async function uploadImage(options: UploadOptions): Promise<UploadResult> {
    const { fileName, mimeType, data } = options;

    try {
        const resolvedMimeType = mimeType || detectMimeType(fileName);
        const objectKey = generateUniqueKey(fileName);
        const bucketName = getBucketName();

        let bodyContent: Uint8Array | Blob | string = data;

        if (typeof data === "string" && data.startsWith("data:")) {
            const base64Data = data.split(",")[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            bodyContent = bytes;
        }

        const putCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: bodyContent,
            ContentType: resolvedMimeType,
        });

        await r2Client.send(putCommand);

        const presignedUrl = await getSignedUrl(r2Client, putCommand, { expiresIn: 3600 });

        const endpointHost = r2Client.config.endpoint?.replace("https://", "") || "";
        const publicUrl = `https://pub-${bucketName}.${endpointHost}/${objectKey}`;

        return {
            objectKey,
            presignedUrl,
            publicUrl,
        };
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`R2 upload failed: ${error.message}`);
        }
        throw new Error("R2 upload failed: Unknown error");
    }
}

export async function uploadBase64Image(
    base64Data: string,
    fileName: string = "image.png"
): Promise<UploadResult> {
    const mimeType = detectMimeType(fileName);
    return uploadImage({
        fileName,
        mimeType,
        data: base64Data,
    });
}
