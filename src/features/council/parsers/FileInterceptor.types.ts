export type FileCategory = 'image' | 'text' | 'pdf' | 'other';

export interface InterceptedFile {
    id: string;
    name: string;
    category: FileCategory;
    mimeType: string;
    data: string;
    size: number;
    capturedAt: number;
}

export interface FileInterceptorConfig {
    maxFileSize: number;
    allowedMimeTypes: string[] | null;
    onFileCaptured?: (file: InterceptedFile) => void;
    onFileRemoved?: (fileId: string) => void;
    onError?: (error: Error, context?: string) => void;
}

export const DEFAULT_CONFIG: FileInterceptorConfig = {
    maxFileSize: 20 * 1024 * 1024,
    allowedMimeTypes: null,
};

const IMAGE_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
];

const TEXT_MIME_TYPES = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'text/csv',
    'text/xml',
    'application/xml',
];

const PDF_MIME_TYPE = 'application/pdf';

export function categorizeMimeType(mimeType: string): FileCategory {
    if (IMAGE_MIME_TYPES.includes(mimeType)) return 'image';
    if (TEXT_MIME_TYPES.includes(mimeType)) return 'text';
    if (mimeType === PDF_MIME_TYPE) return 'pdf';
    return 'other';
}

export function isImageMimeType(mimeType: string): boolean {
    return IMAGE_MIME_TYPES.includes(mimeType);
}

export function isTextMimeType(mimeType: string): boolean {
    return TEXT_MIME_TYPES.includes(mimeType);
}

export function createInterceptedFile(
    file: File,
    data: string
): InterceptedFile {
    return {
        id: crypto.randomUUID(),
        name: file.name,
        category: categorizeMimeType(file.type),
        mimeType: file.type,
        data,
        size: file.size,
        capturedAt: Date.now(),
    };
}
