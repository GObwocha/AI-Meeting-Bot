const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.json());

app.post('/join', async (req, res) => {
    const meetingUrl = req.body.url;
    
    // Acknowledge the request immediately so Google Apps Script doesn't time out
    res.status(200).send({ status: 'Bot deployment initiated.' });

    try {
        console.log(`Deploying bot to: ${meetingUrl}`);
        
        // 1. Launch the headless browser with Ubuntu-specific fixes
        const browser = await puppeteer.launch({
            headless: true, // Runs completely in the background
            args: [
                '--no-sandbox',                  // Required to run as root on a VPS
                '--disable-setuid-sandbox',       // Security bypass needed for headless environments
                '--use-fake-ui-for-media-stream', // Grants microphone/camera permissions automatically
                '--disable-notifications'         // Prevents popup blocks
            ]
        });
        
        const page = await browser.newPage();
        await page.goto(meetingUrl);

        // 2. The Guest Join Flow (Google Meet Example)
        // Wait for the name input text field to appear
        await page.waitForSelector('input[type="text"]', { timeout: 15000 });
        
        // Type your name so the meeting displays your initials ("G")
        await page.type('input[type="text"]', 'Geoffrey Obwocha');
        
        // Find and click the "Join" or "Ask to join" button dynamically
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const joinButton = buttons.find(b => b.innerText.includes('Join') || b.innerText.includes('Ask to join'));
            if (joinButton) joinButton.click();
        });

        console.log("Bot has requested entry. Waiting in the meeting room...");
        // Keep the browser session alive for a 1-hour buffer period
        await new Promise(r => setTimeout(r, 10000));

        // 3. Turn on Captions (Pressing the 'c' key shortcut)
        await page.keyboard.press('c');
        
        let transcript = [];

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
                title: "University Lecture Session", // You can dynamically scrape this from the DOM later
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

        }, 3600000); // Keeps the bot in the call for 1 hour (3600000 ms)

    } catch (error) {
        console.error("Bot execution encountered an error:", error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Capture Engine actively listening on port ${PORT}`));