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

// Helper: Format Date for Display
function getFormattedDate() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Helper: Get Yesterday's Date as YYYYMMDD
function getYesterdayString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Helper: Extract expiry timestamp
function getExpiry(cookieStr) {
    const match = cookieStr.match(/exp=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Helper: Fetch with Timeout
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

// Core Updater Function with Retry Logic
async function updateCookie(key, currentUrl) {
    try {
        console.log(`[${key}] Fetching new cookie...`);

        // Forcefully handle CP Date Logic
        if (key === 'cp') {
            const yStr = getYesterdayString();
            const dateParams = `begin=${yStr}T183000&end=${yStr}T184000`;
            
            if (currentUrl.includes('begin=')) {
                // If dates exist, replace them
                currentUrl = currentUrl.replace(/begin=\d{8}T\d{6}&end=\d{8}T\d{6}/, dateParams);
            } else {
                // If dates are missing entirely, inject them right after the '?'
                currentUrl = currentUrl.replace('?', `?${dateParams}&`);
            }
        }

        const proxyUrl = `https://cookiesgenr.vercel.app/api/Hello?url=${encodeURIComponent(currentUrl)}`;
        
        // Wait up to 35 seconds for Vercel
        const data = await fetchWithTimeout(proxyUrl, 35000);

        if (data.success && data.headers && data.headers['set-cookie']) {
            const pureCookie = data.headers['set-cookie'].split(';')[0];
            const newUrl = currentUrl.replace(/__hdnea__=[^&]+/, pureCookie);

            // Save to Cache
            cache[key].cookie = pureCookie;
            cache[key].last_updated = getFormattedDate();
            cache[key].fullUrl = newUrl;

            console.log(`[${key}] Success! Saved new cookie.`);

            // Calculate 1 Hour Before Expiry
            const exp = getExpiry(pureCookie);
            if (exp > 0) {
                const now = Math.floor(Date.now() / 1000);
                let timeToWait = (exp - now) - 3600; // 1 hour (3600s) before expiry
                
                if (timeToWait < 0) timeToWait = 120; // fallback if already close

                console.log(`[${key}] Next update in ${Math.floor(timeToWait / 60)} minutes.`);
                setTimeout(() => updateCookie(key, newUrl), timeToWait * 1000);
            }
        } else {
            throw new Error("Vercel returned success: false or missing cookie header.");
        }
    } catch (error) {
        console.error(`[${key}] Failed. Reason: ${error.message}`);
        console.log(`[${key}] Failed URL was: ${currentUrl}`); // Logs the failing URL to help debug
        // Retry in 2 minutes
        setTimeout(() => updateCookie(key, currentUrl), 2 * 60 * 1000);
    }
}

// --- ENDPOINTS ---

app.get('/', (req, res) => res.send("Service is running. Keep hitting me every 5 mins."));

// 1. MB Endpoints
app.get('/cookies/mb.json', (req, res) => res.json([{ last_updated: cache.mb.last_updated }, { cookie: cache.mb.cookie }]));
app.get('/cookies/mb', (req, res) => {
    if (req.query.start) {
        updateCookie('mb', req.query.start);
        res.send("MB Triggered! It will now auto-loop.");
    } else res.send("Pass ?start=URL");
});

// 2. CP Endpoints
app.get('/cookies/cp.json', (req, res) => res.json([{ last_updated: cache.cp.last_updated }, { cookie: cache.cp.cookie }]));
app.get('/cookies/cp', (req, res) => {
    if (req.query.start) {
        updateCookie('cp', req.query.start);
        res.send("CP Triggered! Dates forcefully fixed and auto-looping.");
    } else res.send("Pass ?start=URL");
});

// 3. Star 1 Hindi 
app.get('/Star1Hindi.mpd', (req, res) => {
    if (req.query.start) {
        updateCookie('star1', req.query.start);
        return res.send("Star1 Triggered!");
    }
    if (cache.star1.fullUrl) return res.redirect(302, cache.star1.fullUrl);
    res.status(404).send("Not started");
});

// 4. Star 1 HD Hindi
app.get('/Star1HdHindi.mpd', (req, res) => {
    if (req.query.start) {
        updateCookie('star1hd', req.query.start);
        return res.send("Star1HD Triggered!");
    }
    if (cache.star1hd.fullUrl) return res.redirect(302, cache.star1hd.fullUrl);
    res.status(404).send("Not started");
});

app.listen(port, () => console.log(`Running on port ${port}`));
