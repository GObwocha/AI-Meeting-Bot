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
            executablePath: '/usr/bin/google-chrome', // Pointing to the newly installed official Chrome
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
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
            await page.goto(meetingUrl, { waitUntil: 'networkidle2' });

            try {
                await page.waitForSelector('button span:contains("Got it")', { timeout: 3000 });
                await page.evaluate(() => {
                    const dismiss = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Got it') || b.innerText.includes('Dismiss'));
                    if (dismiss) dismiss.click();
                });
            } catch (e) {}

            // await page.waitForSelector('input[aria-label="Your name"], input[type="text"], input[placeholder="Your name"]', { timeout: 15000 });
            // await page.type('input[aria-label="Your name"], input[type="text"], input[placeholder="Your name"]', "Geoffrey Obwocha");

            await page.evaluate(() => {
                const joinBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Ask to join') || b.innerText.includes('Join now'));
                if (joinBtn) joinBtn.click();
            });

            console.log("Waiting to enter the main Google Meet room...");
            await new Promise(resolve => setTimeout(resolve, 12000)); // Wait 12 seconds for admission

            console.log("Activating Google Meet Captions...");
            await page.evaluate(() => {
                // Meet usually has an aria-label containing "Turn on captions"
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