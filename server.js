const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// In-memory Cache
const cache = {
    mb: { cookie: "", fullUrl: "", last_updated: "" },
    cp: { cookie: "", fullUrl: "", last_updated: "" },
    star1: { fullUrl: "" },
    star1hd: { fullUrl: "" }
};

// Helper: Format Date for Display (IST Timezone)
function getFormattedDate() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Helper: Bulletproof Catchup Date Logic (Strictly Asia/Kolkata)
function getCatchupDateParams() {
    // Get exact current date in India
    const dateIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    
    // Subtract 1 day to align with the 18:30 UTC logic
    dateIST.setDate(dateIST.getDate() - 1);
    
    const yyyy = dateIST.getFullYear();
    const mm = String(dateIST.getMonth() + 1).padStart(2, '0');
    const dd = String(dateIST.getDate()).padStart(2, '0');
    
    // Returns perfect format: begin=YYYYMMDDT183000&end=YYYYMMDDT184000
    return `begin=${yyyy}${mm}${dd}T183000&end=${yyyy}${mm}${dd}T184000`;
}

// Helper: Extract expiry timestamp
function getExpiry(cookieStr) {
    const match = cookieStr.match(/exp=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Helper: Fetch with Timeout (Because Vercel is slow)
async function fetchWithTimeout(url, timeoutMs = 35000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// Core Updater Function with Auto-Retry
async function updateCookie(key, currentUrl) {
    try {
        console.log(`[${key}] Fetching new cookie...`);

        // Timezone-Aware CP Date Injection
        if (key === 'cp') {
            const dateParams = getCatchupDateParams();
            if (currentUrl.includes('begin=')) {
                currentUrl = currentUrl.replace(/begin=\d{8}T\d{6}&end=\d{8}T\d{6}/, dateParams);
            } else {
                currentUrl = currentUrl.replace('?', `?${dateParams}&`);
            }
        }

        const proxyUrl = `https://cookiesgenr.vercel.app/api/Hello?url=${encodeURIComponent(currentUrl)}`;
        const data = await fetchWithTimeout(proxyUrl, 35000);

        if (data.success && data.headers && data.headers['set-cookie']) {
            const pureCookie = data.headers['set-cookie'].split(';')[0];
            const newUrl = currentUrl.replace(/__hdnea__=[^&]+/, pureCookie);

            // Save to Cache
            cache[key].cookie = pureCookie;
            cache[key].last_updated = getFormattedDate();
            cache[key].fullUrl = newUrl;

            console.log(`[${key}] Success! Cookie saved.`);

            // Automatically calculate if it's 6 hours (Live) or 24 hours (CP) and refresh 1 hour before expiry
            const exp = getExpiry(pureCookie);
            if (exp > 0) {
                const now = Math.floor(Date.now() / 1000);
                let timeToWait = (exp - now) - 3600; // 1 hour before expiry
                
                if (timeToWait < 0) timeToWait = 120; // Fallback to 2 mins if close

                console.log(`[${key}] Next update scheduled in ${Math.floor(timeToWait / 60)} minutes.`);
                setTimeout(() => updateCookie(key, newUrl), timeToWait * 1000);
            }
        } else {
            throw new Error("No cookie found in response.");
        }
    } catch (error) {
        console.error(`[${key}] Failed. Retrying in 2 minutes... (${error.message})`);
        setTimeout(() => updateCookie(key, currentUrl), 2 * 60 * 1000);
    }
}

// --- ENDPOINTS ---

app.get('/', (req, res) => res.send("Service is active! Base ping successful."));

// 1. MB
app.get('/cookies/mb.json', (req, res) => res.json([{ last_updated: cache.mb.last_updated }, { cookie: cache.mb.cookie }]));
app.get('/cookies/mb', (req, res) => {
    if (req.query.start) { updateCookie('mb', req.query.start); res.send("MB Triggered!"); } 
    else res.send("Pass ?start=URL");
});

// 2. CP (Catchup)
app.get('/cookies/cp.json', (req, res) => res.json([{ last_updated: cache.cp.last_updated }, { cookie: cache.cp.cookie }]));
app.get('/cookies/cp', (req, res) => {
    if (req.query.start) { updateCookie('cp', req.query.start); res.send("CP Triggered! IST Dates Fixed."); } 
    else res.send("Pass ?start=URL");
});

// 3. Star 1 Hindi
app.get('/Star1Hindi.mpd', (req, res) => {
    if (req.query.start) { updateCookie('star1', req.query.start); return res.send("Star1 Triggered!"); }
    if (cache.star1.fullUrl) return res.redirect(302, cache.star1.fullUrl);
    res.status(404).send("Not initialized.");
});

// 4. Star 1 HD Hindi
app.get('/Star1HdHindi.mpd', (req, res) => {
    if (req.query.start) { updateCookie('star1hd', req.query.start); return res.send("Star1HD Triggered!"); }
    if (cache.star1hd.fullUrl) return res.redirect(302, cache.star1hd.fullUrl);
    res.status(404).send("Not initialized.");
});

app.listen(port, () => console.log(`Running on port ${port}`));
