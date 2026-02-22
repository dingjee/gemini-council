/**
 * Debug Script for Gemini Council Injection Points
 * 
 * Run this in browser console on gemini.google.com to verify injection targets
 */

(function debugInjectionPoints() {
    console.log('=== Gemini Council Injection Debug ===\n');

    // 1. Find Chat Container
    console.log('1. Chat Container:');
    const userQuery = document.querySelector('user-query');
    const modelResponse = document.querySelector('model-response');
    const conversationContainer = document.querySelector('.conversation-container');
    const main = document.querySelector('main');

    console.log('   <user-query> found:', !!userQuery);
    console.log('   <model-response> found:', !!modelResponse);
    console.log('   .conversation-container found:', !!conversationContainer);
    console.log('   <main> found:', !!main);

    if (userQuery) {
        let parent = userQuery.parentElement;
        let path = [userQuery.tagName];
        while (parent && path.length < 10) {
            path.push(parent.tagName + (parent.className ? '.' + parent.className.split(' ')[0] : ''));
            parent = parent.parentElement;
        }
        console.log('   user-query parent path:', ' → '.join(path));
    }

    // 2. Find Input Area
    console.log('\n2. Input Area:');
    const selectors = [
        'div[contenteditable="true"][role="textbox"]',
        '.input-area',
        '.compose-area',
        '[data-compose-area]',
        '.send-button-container'
    ];

    selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            console.log(`   ${sel}:`, el);
            console.log(`      parent:`, el.parentElement?.className || el.parentElement?.tagName);
        }
    });

    // 3. Find Send Button
    console.log('\n3. Send Button:');
    const sendBtn = document.querySelector('button[aria-label="Send message"]') ||
                    document.querySelector('.send-button-container button');
    if (sendBtn) {
        console.log('   Found:', sendBtn);
        console.log('   Parent:', sendBtn.parentElement?.className);
    }

    // 4. Check for Council elements
    console.log('\n4. Council Elements:');
    const councilContainers = document.querySelectorAll('.council-conversation-container');
    const contextInjector = document.getElementById('council-context-injector');
    console.log('   .council-conversation-container count:', councilContainers.length);
    console.log('   #council-context-injector found:', !!contextInjector);

    // 5. Visual highlight
    console.log('\n5. Visual Highlight (check page):');
    
    if (main) {
        main.style.outline = '3px solid blue';
        console.log('   <main> highlighted in BLUE');
    }
    
    if (conversationContainer) {
        (conversationContainer as HTMLElement).style.outline = '3px solid green';
        console.log('   .conversation-container highlighted in GREEN');
    }

    const input = document.querySelector('div[contenteditable="true"][role="textbox"]');
    if (input) {
        (input as HTMLElement).style.outline = '3px solid orange';
        console.log('   Input textbox highlighted in ORANGE');
    }

    console.log('\n=== End Debug ===');
    console.log('To remove highlights, run: document.querySelectorAll("*").forEach(el => el.style.outline = "")');
})();
