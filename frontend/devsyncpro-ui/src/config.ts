const isProd = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Helper to construct Render URLs if env vars are missing
const getRenderUrl = (serviceName: string, defaultPort: number) => {
    if (!isProd) return `http://localhost:${defaultPort}`;

    // Check if we already have the URL from process.env (mapped by Render)
    const envKey = `REACT_APP_${serviceName.toUpperCase().replace("-", "_")}_API`;
    const envVal = (process.env as any)[envKey];
    if (envVal) return envVal;

    // Auto-detection logic for onrender.com
    if (window.location.hostname.includes("onrender.com")) {
        const parts = window.location.hostname.split(".");
        const hostName = parts[0]; // e.g., devsyncpro-ui or devsyncpro-ui-static

        // Strategy: find the common prefix. UI is usually [prefix]-ui or [prefix]-ui-static
        let prefix = hostName.split("-ui")[0];
        if (!prefix) prefix = hostName; // Fallback

        return `https://${prefix}-${serviceName}.onrender.com`.replace("--", "-");
    }
    return `http://localhost:${defaultPort}`;
};

export const CONFIG = {
    SCANNER_API: getRenderUrl("scanner", 8081),
    ORCHESTRATOR_API: getRenderUrl("orchestrator", 8082),
    ANALYZER_API: getRenderUrl("analyzer", 8083),
    WS_URL: process.env.REACT_APP_WS_URL || `${wsProtocol}//${getRenderUrl("relay", 9000).replace("https://", "").replace("http://", "")}/ws`
};




