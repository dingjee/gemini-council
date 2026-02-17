import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    categorizeMimeType,
    isImageMimeType,
    isTextMimeType,
    createInterceptedFile,
    DEFAULT_CONFIG,
    type InterceptedFile,
    type FileInterceptorConfig,
} from '../../../../src/features/council/parsers/FileInterceptor.types';
import { FileInterceptor } from '../../../../src/features/council/parsers/FileInterceptor';

describe('FileInterceptor Types', () => {
    describe('categorizeMimeType', () => {
        it('should categorize image types correctly', () => {
            expect(categorizeMimeType('image/png')).toBe('image');
            expect(categorizeMimeType('image/jpeg')).toBe('image');
            expect(categorizeMimeType('image/gif')).toBe('image');
            expect(categorizeMimeType('image/webp')).toBe('image');
            expect(categorizeMimeType('image/svg+xml')).toBe('image');
        });

        it('should categorize text types correctly', () => {
            expect(categorizeMimeType('text/plain')).toBe('text');
            expect(categorizeMimeType('text/markdown')).toBe('text');
            expect(categorizeMimeType('application/json')).toBe('text');
            expect(categorizeMimeType('text/javascript')).toBe('text');
        });

        it('should categorize PDF correctly', () => {
            expect(categorizeMimeType('application/pdf')).toBe('pdf');
        });

        it('should categorize unknown types as other', () => {
            expect(categorizeMimeType('application/octet-stream')).toBe('other');
            expect(categorizeMimeType('video/mp4')).toBe('other');
            expect(categorizeMimeType('audio/mpeg')).toBe('other');
        });
    });

    describe('isImageMimeType', () => {
        it('should return true for image types', () => {
            expect(isImageMimeType('image/png')).toBe(true);
            expect(isImageMimeType('image/jpeg')).toBe(true);
            expect(isImageMimeType('image/gif')).toBe(true);
        });

        it('should return false for non-image types', () => {
            expect(isImageMimeType('text/plain')).toBe(false);
            expect(isImageMimeType('application/pdf')).toBe(false);
        });
    });

    describe('isTextMimeType', () => {
        it('should return true for text types', () => {
            expect(isTextMimeType('text/plain')).toBe(true);
            expect(isTextMimeType('application/json')).toBe(true);
            expect(isTextMimeType('text/markdown')).toBe(true);
        });

        it('should return false for non-text types', () => {
            expect(isTextMimeType('image/png')).toBe(false);
            expect(isTextMimeType('application/pdf')).toBe(false);
        });
    });

    describe('createInterceptedFile', () => {
        it('should create an InterceptedFile with correct properties', () => {
            const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
            const data = 'data:text/plain;base64,dGVzdCBjb250ZW50';

            const intercepted = createInterceptedFile(file, data);

            expect(intercepted.id).toBeDefined();
            expect(intercepted.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(intercepted.name).toBe('test.txt');
            expect(intercepted.category).toBe('text');
            expect(intercepted.mimeType).toBe('text/plain');
            expect(intercepted.data).toBe(data);
            expect(intercepted.capturedAt).toBeLessThanOrEqual(Date.now());
        });

        it('should categorize image files correctly', () => {
            const file = new File([''], 'image.png', { type: 'image/png' });
            const intercepted = createInterceptedFile(file, 'data:image/png;base64,abc');

            expect(intercepted.category).toBe('image');
        });

        it('should categorize PDF files correctly', () => {
            const file = new File([''], 'doc.pdf', { type: 'application/pdf' });
            const intercepted = createInterceptedFile(file, 'data:application/pdf;base64,abc');

            expect(intercepted.category).toBe('pdf');
        });
    });

    describe('DEFAULT_CONFIG', () => {
        it('should have correct default values', () => {
            expect(DEFAULT_CONFIG.maxFileSize).toBe(20 * 1024 * 1024);
            expect(DEFAULT_CONFIG.allowedMimeTypes).toBeNull();
        });
    });
});

describe('FileInterceptor', () => {
    let interceptor: FileInterceptor;
    let capturedFiles: InterceptedFile[];
    let removedFileIds: string[];
    let errors: Array<{ error: Error; context?: string }>;

    const createConfig = (overrides: Partial<FileInterceptorConfig> = {}): Partial<FileInterceptorConfig> => ({
        onFileCaptured: (file) => capturedFiles.push(file),
        onFileRemoved: (id) => removedFileIds.push(id),
        onError: (error, context) => errors.push({ error, context }),
        ...overrides,
    });

    beforeEach(() => {
        capturedFiles = [];
        removedFileIds = [];
        errors = [];
        interceptor = new FileInterceptor(createConfig());
    });

    afterEach(() => {
        interceptor.stop();
    });

    describe('start/stop', () => {
        it('should start and stop correctly', () => {
            interceptor.start();
            expect(interceptor.isActive).toBe(true);

            interceptor.stop();
            expect(interceptor.isActive).toBe(false);
        });

        it('should not start twice', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            interceptor.start();
            interceptor.start();

            expect(consoleSpy).toHaveBeenCalledWith('FileInterceptor: Already active');

            consoleSpy.mockRestore();
        });
    });

    describe('pending files management', () => {
        it('should start with empty pending files', () => {
            expect(interceptor.getPendingFiles()).toEqual([]);
        });

        it('should clear pending files', () => {
            const file: InterceptedFile = {
                id: 'test-id',
                name: 'test.txt',
                category: 'text',
                mimeType: 'text/plain',
                data: 'test data',
                size: 100,
                capturedAt: Date.now(),
            };

            interceptor['pendingFiles'].set(file.id, file);
            expect(interceptor.getPendingFiles().length).toBe(1);

            interceptor.clearPendingFiles();
            expect(interceptor.getPendingFiles()).toEqual([]);
        });

        it('should remove a specific pending file', () => {
            const file: InterceptedFile = {
                id: 'test-id',
                name: 'test.txt',
                category: 'text',
                mimeType: 'text/plain',
                data: 'test data',
                size: 100,
                capturedAt: Date.now(),
            };

            interceptor['pendingFiles'].set(file.id, file);
            const result = interceptor.removePendingFile(file.id);

            expect(result).toBe(true);
            expect(interceptor.getPendingFile(file.id)).toBeUndefined();
            expect(removedFileIds).toContain(file.id);
        });

        it('should return false when removing non-existent file', () => {
            const result = interceptor.removePendingFile('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('FileReader interception', () => {
        it('should capture files read with readAsDataURL', async () => {
            interceptor.start();

            const fileContent = 'test content';
            const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

            const reader = new FileReader();

            const readPromise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error);
            });

            Object.defineProperty(window, 'location', {
                value: { hostname: 'gemini.google.com' },
                writable: true,
            });

            reader.readAsDataURL(file);
            const result = await readPromise;

            expect(result).toContain('data:text/plain');
        });

        it('should restore original FileReader methods on stop', () => {
            const originalReadAsDataURL = FileReader.prototype.readAsDataURL;

            interceptor.start();
            expect(FileReader.prototype.readAsDataURL).not.toBe(originalReadAsDataURL);

            interceptor.stop();
            expect(FileReader.prototype.readAsDataURL).toBe(originalReadAsDataURL);
        });
    });

    describe('file size limit', () => {
        it('should reject files exceeding size limit', async () => {
            const smallInterceptor = new FileInterceptor(createConfig({
                maxFileSize: 10,
            }));

            smallInterceptor.start();

            const file = new File(['x'.repeat(100)], 'large.txt', { type: 'text/plain' });
            const reader = new FileReader();

            const readPromise = new Promise<string>((resolve) => {
                reader.onload = () => resolve('completed');
            });

            Object.defineProperty(window, 'location', {
                value: { hostname: 'gemini.google.com' },
                writable: true,
            });

            reader.readAsDataURL(file);
            await readPromise;

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].context).toBe('size_check');

            smallInterceptor.stop();
        });
    });

    describe('mime type filtering', () => {
        it('should filter by allowed mime types', async () => {
            const filteredInterceptor = new FileInterceptor(createConfig({
                allowedMimeTypes: ['image/png'],
            }));

            filteredInterceptor.start();

            const file = new File(['test'], 'test.txt', { type: 'text/plain' });
            const reader = new FileReader();

            const readPromise = new Promise<void>((resolve) => {
                reader.onload = () => resolve();
            });

            Object.defineProperty(window, 'location', {
                value: { hostname: 'gemini.google.com' },
                writable: true,
            });

            reader.readAsDataURL(file);
            await readPromise;

            expect(filteredInterceptor.getPendingFiles().length).toBe(0);

            filteredInterceptor.stop();
        });
    });

    describe('findFileInputs', () => {
        it('should return empty array when no inputs found', () => {
            const inputs = FileInterceptor.findFileInputs();
            expect(inputs).toEqual([]);
        });
    });
});
