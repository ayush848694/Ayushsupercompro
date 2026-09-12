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

// Helper: Format Date for Display (IST)
function getFormattedDate() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Helper: Bulletproof Catchup Date Logic
function getCatchupDateParams() {
    const dateIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    dateIST.setDate(dateIST.getDate() - 1); // Subtract 1 day
    
    const yyyy = dateIST.getFullYear();
    const mm = String(dateIST.getMonth() + 1).padStart(2, '0');
    const dd = String(dateIST.getDate()).padStart(2, '0');
    
    return `begin=${yyyy}${mm}${dd}T183000&end=${yyyy}${mm}${dd}T184000`;
}

function getExpiry(cookieStr) {
    const match = cookieStr.match(/exp=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

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

// Core Updater Function returning Debug Data
async function updateCookie(key, currentUrl, isManualTrigger = false) {
    let debugData = {
        target_url: "",
        vercel_api_called: "",
        vercel_response: null,
        error: null
    };

    try {
        if (key === 'cp') {
            const dateParams = getCatchupDateParams();
            if (currentUrl.includes('begin=')) {
                currentUrl = currentUrl.replace(/begin=\d{8}T\d{6}&end=\d{8}T\d{6}/, dateParams);
            } else {
                currentUrl = currentUrl.replace('?', `?${dateParams}&`);
            }
        }

        debugData.target_url = currentUrl;
        const proxyUrl = `https://cookiesgenr.vercel.app/api/Hello?url=${encodeURIComponent(currentUrl)}`;
        debugData.vercel_api_called = proxyUrl;

        const data = await fetchWithTimeout(proxyUrl, 35000);
        debugData.vercel_response = data;

        if (data.success && data.headers && data.headers['set-cookie']) {
            const pureCookie = data.headers['set-cookie'].split(';')[0];
            const newUrl = currentUrl.replace(/__hdnea__=[^&]+/, pureCookie);

            cache[key].cookie = pureCookie;
            cache[key].last_updated = getFormattedDate();
            cache[key].fullUrl = newUrl;

            const exp = getExpiry(pureCookie);
            if (exp > 0) {
                const now = Math.floor(Date.now() / 1000);
                let timeToWait = (exp - now) - 3600;
                if (timeToWait < 0) timeToWait = 120;
                
                // Set the loop for next time
                setTimeout(() => updateCookie(key, newUrl), timeToWait * 1000);
            }
        } else {
            throw new Error("No cookie found in Vercel response");
        }

        return debugData;

    } catch (error) {
        debugData.error = error.message;
        // Only auto-retry if it's the background loop, not manual browser trigger
        if (!isManualTrigger) {
            setTimeout(() => updateCookie(key, currentUrl), 2 * 60 * 1000);
        }
        return debugData;
    }
}

// --- ENDPOINTS ---

app.get('/', (req, res) => res.send("Service is active! Base ping successful."));

// 1. MB
app.get('/cookies/mb.json', (req, res) => res.json([{ last_updated: cache.mb.last_updated }, { cookie: cache.mb.cookie }]));
app.get('/cookies/mb', async (req, res) => {
    if (!req.query.start) return res.send("Pass ?start=URL");
    const result = await updateCookie('mb', req.query.start, true);
    res.json(result);
});

// 2. CP (Catchup)
app.get('/cookies/cp.json', (req, res) => res.json([{ last_updated: cache.cp.last_updated }, { cookie: cache.cp.cookie }]));
app.get('/cookies/cp', async (req, res) => {
    if (!req.query.start) return res.send("Pass ?start=URL");
    
    // This will wait for Vercel and show you EXACTLY what happened
    const result = await updateCookie('cp', req.query.start, true);
    res.json(result);
});

// 3. Star 1 Hindi
app.get('/Star1Hindi.mpd', async (req, res) => {
    if (req.query.start) {
        const result = await updateCookie('star1', req.query.start, true);
        return res.json(result);
    }
    if (cache.star1.fullUrl) return res.redirect(302, cache.star1.fullUrl);
    res.status(404).send("Not initialized.");
});

// 4. Star 1 HD Hindi
app.get('/Star1HdHindi.mpd', async (req, res) => {
    if (req.query.start) {
        const result = await updateCookie('star1hd', req.query.start, true);
        return res.json(result);
    }
    if (cache.star1hd.fullUrl) return res.redirect(302, cache.star1hd.fullUrl);
    res.status(404).send("Not initialized.");
});

app.listen(port, () => console.log(`Running on port ${port}`));
