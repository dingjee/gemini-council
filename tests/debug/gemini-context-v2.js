/**
 * Gemini Context Source Verification - Comprehensive Version
 * Intercepts: fetch, XMLHttpRequest, WebSocket
 */

(function comprehensiveVerification() {
    console.log('=== Comprehensive Gemini Context Verification ===\n');

    const capturedData = {
        fetch: [] as any[],
        xhr: [] as any[],
        ws: [] as any[]
    };

    // 1. Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, options] = args;
        const urlStr = url.toString();
        
        capturedData.fetch.push({
            url: urlStr.substring(0, 150),
            method: options?.method || 'GET',
            body: options?.body ? String(options.body).substring(0, 300) : null
        });
        
        console.log('📡 FETCH:', urlStr.substring(0, 100));
        
        return originalFetch.apply(this, args);
    };

    // 2. Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string, ...rest: any[]) {
        (this as any).__url = url;
        (this as any).__method = method;
        return originalXHROpen.apply(this, [method, url, ...rest] as any);
    };

    XMLHttpRequest.prototype.send = function(body?: any) {
        const url = (this as any).__url || '';
        const method = (this as any).__method || 'POST';
        
        capturedData.xhr.push({
            url: url.substring(0, 150),
            method: method,
            body: body ? String(body).substring(0, 500) : null
        });
        
        console.log('📡 XHR:', method, url.substring(0, 100));
        
        if (body) {
            console.log('   Body preview:', String(body).substring(0, 200));
        }
        
        return originalXHRSend.apply(this, [body]);
    };

    // 3. Intercept WebSocket
    const originalWebSocket = window.WebSocket;
    (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
        console.log('🔌 WEBSOCKET:', url.substring(0, 100));
        
        capturedData.ws.push({ url });
        
        const ws = new originalWebSocket(url, protocols);
        
        const originalSend = ws.send;
        ws.send = function(data: any) {
            console.log('🔌 WS SEND:', String(data).substring(0, 300));
            capturedData.ws.push({ sent: String(data).substring(0, 500) });
            return originalSend.apply(this, [data]);
        };
        
        return ws;
    } as any;

    // Expose for inspection
    (window as any).__geminiDebug = capturedData;

    console.log('✅ All interceptors installed (fetch, XHR, WebSocket)');
    console.log('   Send a message, then run:');
    console.log('   window.__geminiDebug');

    // Also check what's currently on the page
    console.log('\n📊 Current Page State:');
    
    const userQueries = document.querySelectorAll('user-query');
    const modelResponses = document.querySelectorAll('model-response');
    console.log('   <user-query>:', userQueries.length);
    console.log('   <model-response>:', modelResponses.length);

    // Check for any existing fetch/XHR activity
    console.log('\n📋 Pre-existing network activity (check Network tab)');

    return capturedData;
})();
