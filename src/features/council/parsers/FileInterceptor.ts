import {
    InterceptedFile,
    FileInterceptorConfig,
    DEFAULT_CONFIG,
    createInterceptedFile,
    isImageMimeType,
    isTextMimeType,
} from './FileInterceptor.types';

const GEMINI_FILE_INPUT_SELECTORS = [
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="file"]',
    'images-files-uploader input[type="file"]',
    'button[xapfileselectortrigger]',
    '.hidden-local-file-image-selector-button',
];

const GEMINI_PREVIEW_CONTAINER_SELECTORS = [
    '.file-preview-container',
    '.uploaded-file-preview',
    '[data-test-id*="file-preview"]',
    '[data-test-id*="image-preview"]',
];

export class FileInterceptor {
    private config: FileInterceptorConfig;
    private pendingFiles: Map<string, InterceptedFile> = new Map();
    private originalFileReader: {
        readAsDataURL: typeof FileReader.prototype.readAsDataURL;
        readAsText: typeof FileReader.prototype.readAsText;
        readAsArrayBuffer: typeof FileReader.prototype.readAsArrayBuffer;
    } | null = null;
    private previewObserver: MutationObserver | null = null;
    private _isActive: boolean = false;

    public get isActive(): boolean {
        return this._isActive;
    }

    constructor(config: Partial<FileInterceptorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    public start(): void {
        if (this._isActive) {
            console.warn('FileInterceptor: Already active');
            return;
        }

        this.interceptFileReader();
        this.startPreviewMonitoring();
        this._isActive = true;
        console.log('FileInterceptor: Started');
    }

    public stop(): void {
        this.restoreFileReader();
        this.stopPreviewMonitoring();
        this.pendingFiles.clear();
        this._isActive = false;
        console.log('FileInterceptor: Stopped');
    }

    public getPendingFiles(): InterceptedFile[] {
        return Array.from(this.pendingFiles.values());
    }

    public getPendingFile(id: string): InterceptedFile | undefined {
        return this.pendingFiles.get(id);
    }

    public clearPendingFiles(): void {
        this.pendingFiles.clear();
    }

    public removePendingFile(id: string): boolean {
        const existed = this.pendingFiles.has(id);
        this.pendingFiles.delete(id);
        if (existed && this.config.onFileRemoved) {
            this.config.onFileRemoved(id);
        }
        return existed;
    }

    private interceptFileReader(): void {
        const self = this;

        this.originalFileReader = {
            readAsDataURL: FileReader.prototype.readAsDataURL,
            readAsText: FileReader.prototype.readAsText,
            readAsArrayBuffer: FileReader.prototype.readAsArrayBuffer,
        };

        FileReader.prototype.readAsDataURL = function(blob: Blob): void {
            self.handleFileRead(this, blob, 'dataURL');
        };

        FileReader.prototype.readAsText = function(blob: Blob, encoding?: string): void {
            self.handleFileRead(this, blob, 'text', encoding);
        };
    }

    private restoreFileReader(): void {
        if (!this.originalFileReader) return;

        FileReader.prototype.readAsDataURL = this.originalFileReader.readAsDataURL;
        FileReader.prototype.readAsText = this.originalFileReader.readAsText;
        FileReader.prototype.readAsArrayBuffer = this.originalFileReader.readAsArrayBuffer;
        this.originalFileReader = null;
    }

    private handleFileRead(
        reader: FileReader,
        blob: Blob,
        readType: 'dataURL' | 'text' | 'arrayBuffer',
        encoding?: string
    ): void {
        const self = this;

        if (!(blob instanceof File)) {
            this.callOriginalRead(reader, blob, readType, encoding);
            return;
        }

        const file = blob as File;

        if (!this.isGeminiContext()) {
            this.callOriginalRead(reader, blob, readType, encoding);
            return;
        }

        if (this.config.maxFileSize && file.size > this.config.maxFileSize) {
            this.handleError(
                new Error(`File size exceeds limit: ${file.size} > ${this.config.maxFileSize}`),
                'size_check'
            );
            this.callOriginalRead(reader, blob, readType, encoding);
            return;
        }

        if (this.config.allowedMimeTypes && !this.config.allowedMimeTypes.includes(file.type)) {
            this.callOriginalRead(reader, blob, readType, encoding);
            return;
        }

        const originalOnLoad = reader.onload;
        const originalOnError = reader.onerror;

        reader.onload = function(ev: ProgressEvent<FileReader>): void {
            const result = reader.result;
            if (typeof result === 'string') {
                self.captureFile(file, result);
            }

            if (originalOnLoad) {
                originalOnLoad.call(this, ev);
            }
        };

        reader.onerror = function(ev: ProgressEvent<FileReader>): void {
            self.handleError(
                new Error('FileReader error'),
                'read_error'
            );
            if (originalOnError) {
                originalOnError.call(this, ev);
            }
        };

        this.callOriginalRead(reader, blob, readType, encoding);
    }

    private callOriginalRead(
        reader: FileReader,
        blob: Blob,
        readType: 'dataURL' | 'text' | 'arrayBuffer',
        encoding?: string
    ): void {
        if (!this.originalFileReader) {
            return;
        }

        switch (readType) {
            case 'dataURL':
                this.originalFileReader.readAsDataURL.call(reader, blob);
                break;
            case 'text':
                this.originalFileReader.readAsText.call(reader, blob, encoding);
                break;
            case 'arrayBuffer':
                this.originalFileReader.readAsArrayBuffer.call(reader, blob);
                break;
        }
    }

    private captureFile(file: File, data: string): void {
        try {
            const interceptedFile = createInterceptedFile(file, data);
            this.pendingFiles.set(interceptedFile.id, interceptedFile);

            console.log('FileInterceptor: Captured file', {
                id: interceptedFile.id,
                name: interceptedFile.name,
                category: interceptedFile.category,
                size: interceptedFile.size,
            });

            if (this.config.onFileCaptured) {
                this.config.onFileCaptured(interceptedFile);
            }
        } catch (error) {
            this.handleError(
                error instanceof Error ? error : new Error(String(error)),
                'capture'
            );
        }
    }

    private isGeminiContext(): boolean {
        const hostname = window.location.hostname;
        return hostname.includes('gemini.google') || hostname.includes('bard.google');
    }

    private startPreviewMonitoring(): void {
        this.previewObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    this.handlePreviewMutation(mutation);
                }
            }
        });

        this.previewObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    private stopPreviewMonitoring(): void {
        if (this.previewObserver) {
            this.previewObserver.disconnect();
            this.previewObserver = null;
        }
    }

    private handlePreviewMutation(mutation: MutationRecord): void {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const element = node as Element;
            this.checkForFilePreview(element);
        });
    }

    private checkForFilePreview(element: Element): void {
        for (const selector of GEMINI_PREVIEW_CONTAINER_SELECTORS) {
            const previews = element.matches(selector)
                ? [element]
                : Array.from(element.querySelectorAll(selector));

            previews.forEach((preview) => {
                this.extractPreviewContent(preview as HTMLElement);
            });
        }
    }

    private extractPreviewContent(previewElement: HTMLElement): void {
        const img = previewElement.querySelector('img');
        if (img && img.src) {
            this.extractImageFromPreview(img, previewElement);
            return;
        }

        const fileName = previewElement.getAttribute('data-filename') ||
            previewElement.querySelector('[data-filename]')?.getAttribute('data-filename') ||
            previewElement.textContent?.trim();

        if (fileName && !this.hasFileWithName(fileName)) {
            console.log('FileInterceptor: Detected file preview without captured content:', fileName);
        }
    }

    private extractImageFromPreview(img: HTMLImageElement, container: HTMLElement): void {
        const src = img.src;
        if (!src) return;

        if (src.startsWith('data:')) {
            const fileName = this.guessFileName(container, img, 'image');
            if (!this.hasFileWithName(fileName)) {
                const mimeType = this.extractMimeTypeFromDataURL(src) || 'image/png';
                const interceptedFile: InterceptedFile = {
                    id: crypto.randomUUID(),
                    name: fileName,
                    category: 'image',
                    mimeType,
                    data: src,
                    size: this.estimateBase64Size(src),
                    capturedAt: Date.now(),
                };

                this.pendingFiles.set(interceptedFile.id, interceptedFile);
                console.log('FileInterceptor: Extracted image from preview', interceptedFile.id);

                if (this.config.onFileCaptured) {
                    this.config.onFileCaptured(interceptedFile);
                }
            }
        } else if (src.startsWith('blob:')) {
            this.fetchBlobUrl(src, container, img);
        }
    }

    private async fetchBlobUrl(url: string, container: HTMLElement, img: HTMLImageElement): Promise<void> {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();

            reader.onload = () => {
                const data = reader.result as string;
                const fileName = this.guessFileName(container, img, blob.type.split('/')[0] || 'file');

                if (!this.hasFileWithName(fileName)) {
                    const interceptedFile: InterceptedFile = {
                        id: crypto.randomUUID(),
                        name: fileName,
                        category: isImageMimeType(blob.type) ? 'image' : 'other',
                        mimeType: blob.type,
                        data,
                        size: blob.size,
                        capturedAt: Date.now(),
                    };

                    this.pendingFiles.set(interceptedFile.id, interceptedFile);
                    console.log('FileInterceptor: Fetched blob URL', interceptedFile.id);

                    if (this.config.onFileCaptured) {
                        this.config.onFileCaptured(interceptedFile);
                    }
                }
            };

            reader.readAsDataURL(blob);
        } catch (error) {
            this.handleError(
                error instanceof Error ? error : new Error(String(error)),
                'blob_fetch'
            );
        }
    }

    private guessFileName(container: HTMLElement, img: HTMLImageElement, defaultType: string): string {
        const ariaLabel = img.getAttribute('aria-label') || container.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        const dataName = container.getAttribute('data-name') ||
            container.querySelector('[data-name]')?.getAttribute('data-name');
        if (dataName) return dataName;

        const alt = img.alt;
        if (alt) return alt;

        const timestamp = Date.now();
        const ext = defaultType === 'image' ? 'png' : 'bin';
        return `uploaded_file_${timestamp}.${ext}`;
    }

    private hasFileWithName(name: string): boolean {
        for (const file of this.pendingFiles.values()) {
            if (file.name === name) return true;
        }
        return false;
    }

    private extractMimeTypeFromDataURL(dataURL: string): string | null {
        const match = dataURL.match(/^data:([^;]+);/);
        return match ? match[1] : null;
    }

    private estimateBase64Size(base64: string): number {
        const padding = (base64.match(/=/g) || []).length;
        return Math.floor((base64.length - padding) * 3 / 4);
    }

    private handleError(error: Error, context?: string): void {
        console.error('FileInterceptor: Error', context, error);
        if (this.config.onError) {
            this.config.onError(error, context);
        }
    }

    public static findFileInputs(): HTMLInputElement[] {
        const inputs: HTMLInputElement[] = [];

        for (const selector of GEMINI_FILE_INPUT_SELECTORS) {
            const found = document.querySelectorAll<HTMLInputElement>(selector);
            found.forEach(input => {
                if (!inputs.includes(input)) {
                    inputs.push(input);
                }
            });
        }

        return inputs;
    }
}
