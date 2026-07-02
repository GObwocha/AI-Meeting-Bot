const fs = require('fs').promises;
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
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
        // 1. Launch the STEALTH headless browser
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome', // Keeping the official Chrome!
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--use-fake-ui-for-media-stream',
                '--disable-notifications',
                '--disable-blink-features=AutomationControlled', // Hides the "Chrome is being controlled by automated software" flag
                '--start-maximized'
            ],
            defaultViewport: null, // Forces the browser to look like a real screen size
            ignoreDefaultArgs: ['--enable-automation'] // Strips automation tags
        });
        
        const page = await browser.newPage();

        // --- COOKIE INJECTION ---
        try {
            console.log("Attempting to load Google authentication cookies...");
            const cookiesString = await fs.readFile('/root/AI-Meeting-Bot/cookies.json', 'utf8');
            const cookies = JSON.parse(cookiesString);
            await page.setCookie(...cookies);
            console.log("Cookies successfully injected! The bot is authenticated.");
        } catch (err) {
            console.log("Warning: No cookies.json found. Bot will attempt to join anonymously (which may fail).");
        }
        // ------------------------

        // ---------------------------------------------------------
        // MULTI-PLATFORM ROUTING & CAPTION ACTIVATION
        // ---------------------------------------------------------
        
        if (meetingUrl.includes('meet.google.com')) {
            console.log("Platform detected: Google Meet");
            
            // Wait for network to settle, then pause 3 extra seconds 
            // to let Google's background auth redirects finish
            await page.goto(meetingUrl, { waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Dismiss hardware popups if they exist
            try {
                await page.evaluate(() => {
                    const dismiss = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('Got it') || b.innerText.includes('Dismiss')));
                    if (dismiss) dismiss.click();
                });
            } catch (e) {}

            // SMART CHECK: Only try to type a name if the box exists
            try {
                console.log("Checking if name input is required...");
                // Shortened timeout to 5 seconds. If it's not there, we don't need it.
                await page.waitForSelector('input[aria-label="Your name"], input[type="text"], input[placeholder="Your name"]', { timeout: 5000 });
                await page.type('input[aria-label="Your name"], input[type="text"], input[placeholder="Your name"]', "Geoffrey Obwocha");
                console.log("Name entered.");
            } catch (err) {
                console.log("No name input found. The bot is successfully authenticated!");
            }

            // Take a picture of the final lobby screen
            await page.screenshot({ path: 'debug-03-ready-to-join.png' });

            // Click the Join button
            // Take a picture of the final lobby screen
            await page.screenshot({ path: 'debug-03-ready-to-join.png' });

            // 1. CLEAR OVERLAYS: Press 'Escape' to dismiss the "Microphone not found" popup
            console.log("Dismissing any blocking popups...");
            await page.keyboard.press('Escape');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Take a picture of the final lobby screen
            await page.screenshot({ path: 'debug-03-ready-to-join.png' });

            // 1. CLEAR OVERLAYS: Press 'Escape' to dismiss the "Microphone not found" popup
            console.log("Dismissing any blocking popups...");
            await page.keyboard.press('Escape');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. AGGRESSIVE CLICK: Search for the exact button and log the result
            console.log("Hunting for the Join button...");
            const joinResult = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('button, [role="button"]'));
                
                // Pass 1: Look for exact innerText match
                for (let el of elements) {
                    const text = (el.innerText || '').trim().toLowerCase();
                    if (text === 'ask to join' || text === 'join now') {
                        el.click();
                        return "Pass 1 Success: Clicked exact match -> " + text;
                    }
                }
                
                // Pass 2: Look for partial match, but explicitly ignore "Other ways to join"
                for (let el of elements) {
                    const text = (el.textContent || '').trim().toLowerCase();
                    if ((text.includes('ask to join') || text.includes('join now')) && !text.includes('other')) {
                        el.click();
                        return "Pass 2 Success: Clicked partial match -> " + text;
                    }
                }
                
                return "FAIL: Could not find any button matching 'Join' criteria.";
            });
            console.log("Join button action:", joinResult);

            // 📸 NEW: Wait 2 seconds for the UI to transition, then take a photo
            await new Promise(resolve => setTimeout(resolve, 2000));
            await page.screenshot({ path: 'debug-04-post-click.png' });
            console.log("Saved post-click screenshot as debug-04-post-click.png");

            // Adjusted wait time since we already waited 2 seconds above
            console.log("Waiting to enter the main Google Meet room...");
            await new Promise(resolve => setTimeout(resolve, 10000));

            console.log("Activating Google Meet Captions...");
            await page.evaluate(() => {
                const ccBtn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.getAttribute('aria-label') && b.getAttribute('aria-label').toLowerCase().includes('turn on captions')
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
        page.on('domcontentloaded', async () => {
             // 1. Expose a function so the browser can send text back to our Node server
        await page.exposeFunction('captureCaption', (text) => {
            // Only add the text if it's not a duplicate of the last line
            if (text && text !== transcript[transcript.length - 1]) {
                transcript.push(text);
                console.log(`[Captured]: ${text}`);
            }
        });

        // 2. Inject the observer into the Google Meet webpage
        await page.evaluate(() => {
            // Google Meet usually puts captions in a container with specific roles or aria-live attributes.
            // We observe the whole body but filter for text changes.
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length) {
                        mutation.addedNodes.forEach((node) => {
                            // Target span elements which usually contain the caption text in Meet
                            if (node.nodeType === 1 && node.tagName === 'SPAN' && node.innerText) {
                                // Send the text back to Node.js
                                window.captureCaption(node.innerText.trim());
                            }
                        });
                    }
                });
            });

            // Start watching the page for new captions
            observer.observe(document.body, { childList: true, subtree: true });
        });
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