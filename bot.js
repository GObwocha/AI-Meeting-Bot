const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.json());

app.post('/join', async (req, res) => {
    const meetingUrl = req.body.url;
    const meetingTitle = req.body.meetingTitle || "Automated Meeting Session";

    // Acknowledge the request immediately so Google Apps Script doesn't time out
    res.status(200).send({ status: 'Bot deployment initiated.' });

    try {
        console.log(`Deploying bot to: ${meetingUrl}`);
        
        // 1. Launch the headless browser with Ubuntu-specific fixes
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',            // ← ADD: prevents Chrome crash on Droplet
                '--disable-blink-features=AutomationControlled', // ← ADD: bypasses bot detection
                '--use-fake-ui-for-media-stream',
                '--disable-notifications'
            ]
        });
        
        const page = await browser.newPage();

        // ---------------------------------------------------------
        // MULTI-PLATFORM ROUTING & CAPTION ACTIVATION
        // ---------------------------------------------------------
        
        if (meetingUrl.includes('meet.google.com')) {
            console.log("Platform detected: Google Meet");

            // Add automation-detection evasion BEFORE navigating
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // ── STEP 1: Debug screenshot so you can see what state the page is in ──
            await page.screenshot({ path: '/root/AI-Meeting-Bot/debug-step1-landing.png' });
            console.log("Screenshot saved: debug-step1-landing.png");

            // ── STEP 2: Handle "Got it" / cookie / consent dialogs ──
            await page.evaluate(() => {
                const dismiss = Array.from(document.querySelectorAll('button')).find(b =>
                    b.innerText.includes('Got it') || b.innerText.includes('Dismiss') || b.innerText.includes('Accept all')
                );
                if (dismiss) dismiss.click();
            });
            await new Promise(r => setTimeout(r, 2000));

            // ── STEP 3: Handle "Continue without signing in" / guest flow ──
            try {
                await page.waitForSelector('button[jsname="V67aGc"], [data-idom-class*="guest"], button', { timeout: 5000 });
                await page.evaluate(() => {
                    const guestBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b =>
                        b.innerText && (
                            b.innerText.includes('Continue without') ||
                            b.innerText.includes('Use without') ||
                            b.innerText.includes('Guest') ||
                            b.innerText.includes('Continue as guest')
                        )
                    );
                    if (guestBtn) {
                        console.log("Clicking guest/continue button...");
                        guestBtn.click();
                    }
                });
                await new Promise(r => setTimeout(r, 3000));
            } catch(e) {
                console.log("No guest/continue button found, proceeding...");
            }

            // ── STEP 4: Screenshot after guest step ──
            await page.screenshot({ path: '/root/AI-Meeting-Bot/debug-step2-afterguest.png' });
            console.log("Screenshot saved: debug-step2-afterguest.png");

            // ── STEP 5: Find and fill the name input with multiple selectors ──
            const nameSelectors = [
                'input[aria-label="Your name"]',
                'input[placeholder="Your name"]',
                'input[type="text"][autocomplete="name"]',
                'input[jsname="YPqjbf"]',
                'input[type="text"]'
            ];

            let nameInputFound = false;
            for (const selector of nameSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    await page.click(selector, { clickCount: 3 }); // triple-click to select any existing text
                    await page.type(selector, "AI Meeting Bot");
                    console.log(`Name entered using selector: ${selector}`);
                    nameInputFound = true;
                    break;
                } catch(e) {
                    console.log(`Selector not found: ${selector}`);
                }
            }

            if (!nameInputFound) {
                await page.screenshot({ path: '/root/AI-Meeting-Bot/debug-step3-namefail.png' });
                console.log("CRITICAL: Could not find name input. Check debug-step3-namefail.png");
            }

            await new Promise(r => setTimeout(r, 1000));

            // ── STEP 6: Click the join button ──
            await page.evaluate(() => {
                const joinBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b =>
                    b.innerText && (
                        b.innerText.includes('Ask to join') ||
                        b.innerText.includes('Join now') ||
                        b.innerText.includes('Request to join')
                    )
                );
                if (joinBtn) {
                    console.log("Join button found, clicking...");
                    joinBtn.click();
                }
            });

            await page.screenshot({ path: '/root/AI-Meeting-Bot/debug-step4-afterjoin.png' });
            console.log("Waiting 12s for admission...");
            await new Promise(r => setTimeout(r, 12000));

            // ── STEP 7: Activate captions ──
            await page.evaluate(() => {
                const ccBtn = Array.from(document.querySelectorAll('button')).find(b =>
                    b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Turn on captions')
                );
                if (ccBtn) ccBtn.click();
            });

        } else if (meetingUrl.includes('teams.microsoft.com')) {
            console.log("Platform detected: Microsoft Teams");
            await page.goto(meetingUrl, { waitUntil: 'networkidle2' });

            try {
                const webBtn = await page.waitForSelector('button[data-tid="joinOnWeb"]', { timeout: 10000 });
                if (webBtn) await webBtn.click();
            } catch (e) {}

            await page.waitForSelector('input[id="username"], input[placeholder="Enter name"]', { timeout: 15000 });
            await page.type('input[id="username"], input[placeholder="Enter name"]', "Geoffrey Obwocha");
            
            await page.click('button[data-tid="preauth-join-button"]');

            console.log("Waiting to enter the main Teams room...");
            await new Promise(resolve => setTimeout(resolve, 15000)); // Teams is heavy, wait 15 seconds

            console.log("Activating Microsoft Teams Captions...");
            await page.evaluate(() => {
                // Teams hides captions under the "More" or "..." menu
                const moreBtn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.getAttribute('aria-label') && b.getAttribute('aria-label').toLowerCase().includes('more actions')
                );
                if (moreBtn) {
                    moreBtn.click();
                    // Wait a moment for the dropdown to render, then click live captions
                    setTimeout(() => {
                        const ccItem = Array.from(document.querySelectorAll('*')).find(el => 
                            el.innerText && el.innerText.toLowerCase().includes('turn on live captions')
                        );
                        if (ccItem) ccItem.click();
                    }, 2000);
                }
            });

        } else if (meetingUrl.includes('zoom.us')) {
            console.log("Platform detected: Zoom");
            
            const webClientUrl = meetingUrl.replace('/j/', '/wc/join/').replace('/my/', '/wc/join/');
            await page.goto(webClientUrl, { waitUntil: 'networkidle2' });

            await page.waitForSelector('input[id="inputname"], input[name="name"]', { timeout: 15000 });
            await page.type('input[id="inputname"], input[name="name"]', "Geoffrey Obwocha");
            
            await page.click('button[id="joinBtn"]');

            console.log("Waiting to enter the main Zoom room...");
            await new Promise(resolve => setTimeout(resolve, 12000)); 

            console.log("Activating Zoom Captions...");
            await page.evaluate(() => {
                // Zoom usually has a "Show Captions" or "Closed Caption" button
                const ccBtn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.getAttribute('aria-label') && (b.getAttribute('aria-label').toLowerCase().includes('show captions') || b.getAttribute('aria-label').toLowerCase().includes('closed caption'))
                );
                if (ccBtn) ccBtn.click();
            });

        } else {
            console.log("Unsupported meeting platform detected.");
            await browser.close();
            return res.status(400).send("Unsupported platform");
        }
        
        // ---------------------------------------------------------
        
        let transcript = [];

        // Monitor the DOM for new caption text appearing
        // 1. Expose the capture function FIRST
        await page.exposeFunction('captureCaption', (text) => {
            if (text && text !== transcript[transcript.length - 1]) {
                transcript.push(text);
                console.log(`[Captured]: ${text}`);
            }
        });

        // 2. Then inject the observer
        await page.evaluate(() => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.tagName === 'SPAN' && node.innerText) {
                            window.captureCaption(node.innerText.trim());
                        }
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });

        // 4. End of Meeting Lifecycle handler
        setTimeout(async () => {
            console.log("Meeting complete. Shutting down browser session...");
            await browser.close();
            
            /* * ==========================================
             * PHASE 3 INTEGRATION POINT
             * This is where we will write the code to send 
             * the collected transcript array back to your 
             * Google Apps Script Webhook.
             * ==========================================
             */ 
            // Build the final payload to pass back to Google Apps Script
            const payload = {
                title: meetingTitle,
                transcript: transcript
            };
            
            // Replace this string with your exact Web App URL from Step 3
            const googleWebAppUrl = "https://script.google.com/macros/s/AKfycbzEqUpOHlLI7PnQHiRwdN017RAY2u1Cy6RcY_R8bWe3HR3WPADgHVWlj8ekgMzYcJAh2w/exec"
            
            console.log("Pushing transcript data directly to Google Apps Script...");
            
            fetch(googleWebAppUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(response => console.log("Payload routed successfully to script manager."))
            .catch(err => console.error("Failed to route payload to script manager:", err));

        }, 120000); // Keeps the bot in the call for 1 hour (3600000 ms)

    } catch (error) {
        console.error("Bot execution encountered an error:", error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Capture Engine actively listening on port ${PORT}`));