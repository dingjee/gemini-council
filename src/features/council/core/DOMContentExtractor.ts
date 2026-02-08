/**
 * DOMContentExtractor - Extracts chat content from Gemini's DOM
 * Ported and adapted from legacy codebase
 */

export interface ContentPart {
    text: string;
    type: 'text' | 'code' | 'image' | 'file';
    language?: string;
}

export interface ChatTurn {
    role: 'user' | 'model';
    parts: ContentPart[];
    text: string; // Combined text representation
}

export class DOMContentExtractor {
    /**
     * Extract all chat turns from the current conversation
     */
    public static extractChatHistory(): ChatTurn[] {
        const turns: ChatTurn[] = [];

        // Find all message containers
        // Gemini structure: user-query, model-response
        const elements = document.querySelectorAll('user-query, model-response');

        elements.forEach(el => {
            if (el.tagName.toLowerCase() === 'user-query') {
                const turn = this.extractUserTurn(el as HTMLElement);
                if (turn) turns.push(turn);
            } else if (el.tagName.toLowerCase() === 'model-response') {
                const turn = this.extractModelTurn(el as HTMLElement);
                if (turn) turns.push(turn);
            }
        });

        return turns;
    }

    private static extractUserTurn(element: HTMLElement): ChatTurn | null {
        // User query text is usually in .query-text or .user-query-container
        const textElement = element.querySelector('.query-text') || element;
        const text = textElement.textContent || '';

        // Check for images/files
        // .file-preview-container
        const files: ContentPart[] = [];
        const filePreviews = element.querySelectorAll('.file-preview-container img');
        filePreviews.forEach(img => {
            files.push({
                text: '[Image]',
                type: 'image',
            });
        });

        return {
            role: 'user',
            parts: [...files, { text: text.trim(), type: 'text' }],
            text: text.trim() + (files.length > 0 ? ` [${files.length} images]` : '')
        };
    }

    private static extractModelTurn(element: HTMLElement): ChatTurn | null {
        // Model response content is in .model-response-text or markdown-main-panel
        const contentContainer = element.querySelector('.model-response-text, .markdown-main-panel');
        if (!contentContainer) return null;

        const combinedText = this.processInlineContent(contentContainer as HTMLElement);

        return {
            role: 'model',
            parts: [{ text: combinedText, type: 'text' }],
            text: combinedText
        };
    }

    private static processInlineContent(element: HTMLElement): string {
        let textParts: string[] = [];

        const processNode = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Normalize but don't over-trim here, whitespace matters inline
                textParts.push(node.textContent || '');
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const el = node as HTMLElement;

            // --- Math Handling ---

            // Check for explicit data-tex attribute (often used by Gemini)
            const texAttr = el.getAttribute('data-tex') || el.getAttribute('alt');
            // Check for MathJax or Katex containers
            if (el.classList.contains('math-jax') || el.tagName.toLowerCase() === 'math-jax' || (el.tagName === 'IMG' && el.classList.contains('formula'))) {
                if (texAttr) {
                    textParts.push(`$${texAttr}$`);
                    return;
                }
            }

            // Check for Gemini's specific math containers
            if (el.classList.contains('horizontal-scroll-container') || el.tagName === 'CS-MATH') {
                const tex = el.getAttribute('data-tex') || el.textContent;
                if (tex) {
                    textParts.push(`\n$$\n${tex.trim()}\n$$\n`);
                    return;
                }
            }

            // Angular/Gemini often hides original latex in a specific element
            if (el.classList.contains('katex-mathml')) {
                // Skip visual MathML if we can find the source, 
                // usually Katex renders both mathml (for a11y) and html.
                // We prefer the tex source if available nearby.
                return;
            }

            // Katex source is often in <annotation encoding="application/x-tex"> inside <semantics> inside <math>
            // But usually we just grab text content of the parent if it's block math.

            // --- Formatting ---

            // Code Blocks
            if (el.tagName === 'CODE-BLOCK' || el.classList.contains('code-block')) {
                const code = el.querySelector('code')?.textContent || '';
                const lang = el.getAttribute('language') ||
                    el.querySelector('.code-block-decoration')?.textContent || '';
                textParts.push(`\n\`\`\`${lang.trim()}\n${code}\n\`\`\`\n`);
                return;
            }

            // Inline Code
            if (el.tagName === 'CODE' && !el.closest('pre')) {
                const text = (el.textContent || '').trim();
                textParts.push(`\`${text}\``);
                return;
            }

            // Emphasis
            if (el.tagName === 'I' || el.tagName === 'EM') {
                const text = (el.textContent || '').trim();
                textParts.push(`*${text}*`);
                return;
            }

            // Strong
            if (el.tagName === 'B' || el.tagName === 'STRONG') {
                const text = (el.textContent || '').trim();
                textParts.push(`**${text}**`);
                return;
            }

            // Tables
            if (el.tagName === 'TABLE') {
                textParts.push('\n' + this.tableToMarkdown(el as HTMLTableElement) + '\n');
                return;
            }

            // Block elements (Lists, Paragraphs)
            const isBlock = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR'].includes(el.tagName);

            if (isBlock) textParts.push('\n');
            if (el.tagName === 'LI') textParts.push('- ');

            // Recurse
            Array.from(el.childNodes).forEach(processNode);

            if (isBlock) textParts.push('\n');
        };

        Array.from(element.childNodes).forEach(processNode);

        // Post-processing to clean up whitespace
        return textParts.join('').replace(/\n{3,}/g, '\n\n').trim();
    }

    private static normalizeText(text: string): string {
        return text.replace(/\s+/g, ' ').trim();
    }

    private static tableToMarkdown(table: HTMLTableElement): string {
        try {
            // Remove action buttons from clone
            const cleanTable = table.cloneNode(true) as HTMLElement;
            cleanTable.querySelectorAll('button, mat-icon').forEach(e => e.remove());

            const rows = Array.from(cleanTable.querySelectorAll('tr'));
            if (rows.length === 0) return '';

            let md = '';

            // Helper to get text from cells
            const getCells = (row: Element) =>
                Array.from(row.querySelectorAll('td, th'))
                    .map(c => (c.textContent || '').replace(/[\r\n]+/g, ' ').trim());

            // Process Header (usually first row)
            const headerCells = getCells(rows[0]!);
            md += '| ' + headerCells.join(' | ') + ' |\n';
            md += '| ' + headerCells.map(() => '---').join(' | ') + ' |\n';

            // Process Body
            for (let i = 1; i < rows.length; i++) {
                const cells = getCells(rows[i]!);
                md += '| ' + cells.join(' | ') + ' |\n';
            }
            return md;
        } catch (e) {
            return '[Table]';
        }
    }
}
