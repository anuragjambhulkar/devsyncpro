const isProd = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Helper to construct Render URLs if env vars are missing
const getRenderUrl = (serviceName: string, defaultPort: number) => {
    if (!isProd) return `http://localhost:${defaultPort}`;

    const envKey = `REACT_APP_${serviceName.toUpperCase().replace(/-/g, "_")}_API`;
    const envVal = (process.env as any)[envKey];
    if (envVal) {
        // Render 'host' property doesn't include https:// prefix
        return envVal.startsWith("http") ? envVal : `https://${envVal}`;
    }

    // Fallback logic for common Render naming patterns
    if (window.location.hostname.includes("onrender.com")) {
        const fullHost = window.location.hostname;
        // If we're on the UI, try to find the backend relative to the common prefix
        const base = fullHost.split(".")[0].replace("-ui-static", "").replace("-ui", "");

        if (serviceName === "scanner") {
            return `https://${base}-3.onrender.com`; // Known livedevsyncpro-3
        }
        return `https://${base}-${serviceName}.onrender.com`.replace("--", "-");
    }
    return `http://localhost:${defaultPort}`;
};

export const CONFIG = {
    SCANNER_API: getRenderUrl("scanner", 10000),
    ORCHESTRATOR_API: getRenderUrl("orchestrator", 10000),
    ANALYZER_API: getRenderUrl("analyzer", 10000),
    WS_URL: `${wsProtocol}//${getRenderUrl("relay", 10000).replace("https://", "").replace("http://", "")}/ws`
};

if (isProd) {
    console.log("PRODUCTION CONFIG LOADED:", CONFIG);
}











