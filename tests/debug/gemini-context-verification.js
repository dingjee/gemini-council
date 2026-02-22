/**
 * Gemini Context Source Verification Script
 * 
 * Purpose: Determine how Gemini web app obtains conversation context
 * - Does it read from DOM?
 * - Does it use backend session/conversation ID?
 * 
 * Run this in browser console on gemini.google.com
 */

(function verifyGeminiContextSource() {
    console.log('=== Gemini Context Source Verification ===\n');

    // 1. Check for conversation/session identifiers in URL
    console.log('1. URL Analysis:');
    const url = new URL(window.location.href);
    console.log('   Pathname:', url.pathname);
    console.log('   Search params:', url.search);
    
    // Gemini often uses URL like /app/CONVERSATION_ID
    const pathParts = url.pathname.split('/');
    const possibleConvId = pathParts[pathParts.length - 1];
    console.log('   Possible conversation ID:', possibleConvId);

    // 2. Intercept fetch requests to see what's sent
    console.log('\n2. Request Interception Setup:');
    
    const originalFetch = window.fetch;
    const capturedRequests: any[] = [];

    window.fetch = async function(...args) {
        const [url, options] = args;
        
        if (url.toString().includes('gemini.google.com') || 
            url.toString().includes('bard.google.com') ||
            url.toString().includes('/api/') ||
            url.toString().includes('/generate')) {
            
            const requestData = {
                url: url.toString(),
                method: options?.method,
                body: null as any,
                headers: options?.headers,
            };

            // Try to parse body
            if (options?.body) {
                try {
                    if (typeof options.body === 'string') {
                        requestData.body = JSON.parse(options.body);
                    } else if (options.body instanceof FormData) {
                        requestData.body = Object.fromEntries(options.body);
                    }
                } catch {
                    requestData.body = '[Unable to parse]';
                }
            }

            capturedRequests.push(requestData);
            console.log('\n📡 Captured Request to:', url.toString().substring(0, 80));
            console.log('   Method:', options?.method);
            
            if (requestData.body) {
                console.log('   Body keys:', Object.keys(requestData.body));
                
                // Check for conversation history in body
                const bodyStr = JSON.stringify(requestData.body);
                if (bodyStr.includes('history') || bodyStr.includes('messages') || bodyStr.includes('context')) {
                    console.log('   ✅ Contains history/messages/context in body');
                }
                if (bodyStr.includes('conversationId') || bodyStr.includes('session')) {
                    console.log('   ✅ Contains conversation/session ID');
                }
            }
        }

        return originalFetch.apply(this, args);
    };

    console.log('   ✅ Fetch interceptor installed');
    console.log('   → Send a message in Gemini to capture the request\n');

    // 3. Check DOM structure for conversation elements
    console.log('3. DOM Structure Analysis:');
    
    const userQueries = document.querySelectorAll('user-query');
    const modelResponses = document.querySelectorAll('model-response');
    const conversationContainers = document.querySelectorAll('.conversation-container');
    
    console.log('   <user-query> elements:', userQueries.length);
    console.log('   <model-response> elements:', modelResponses.length);
    console.log('   .conversation-container elements:', conversationContainers.length);

    // 4. Check for hidden inputs or data attributes
    console.log('\n4. Hidden Data Check:');
    
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    console.log('   Hidden inputs:', hiddenInputs.length);
    hiddenInputs.forEach(input => {
        console.log('   - name:', input.getAttribute('name'), 'value length:', (input as HTMLInputElement).value?.length);
    });

    // 5. Check for __NEXT_DATA__ or similar React/Next.js data
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) {
        console.log('   __NEXT_DATA__ found');
        try {
            const data = JSON.parse(nextData.textContent || '');
            console.log('   Keys:', Object.keys(data));
        } catch {
            console.log('   Unable to parse __NEXT_DATA__');
        }
    }

    // 6. Check localStorage/sessionStorage for conversation data
    console.log('\n5. Storage Check:');
    
    const relevantKeys = Object.keys(localStorage).filter(k => 
        k.includes('conversation') || 
        k.includes('session') || 
        k.includes('gemini') ||
        k.includes('bard')
    );
    console.log('   Relevant localStorage keys:', relevantKeys);

    // 7. Expose captured requests for later inspection
    (window as any).__geminiRequests = capturedRequests;
    console.log('\n=== Setup Complete ===');
    console.log('Send a message in Gemini, then run:');
    console.log('  console.log(window.__geminiRequests)');
    console.log('\nOr run this to analyze:');
    console.log('  window.__geminiRequests.forEach(r => console.log(r.url, r.body))');

    return {
        capturedRequests,
        possibleConvId,
        domElements: {
            userQueries: userQueries.length,
            modelResponses: modelResponses.length
        }
    };
})();
