const isProd = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Helper to construct Render URLs if env vars are missing
const getRenderUrl = (serviceName: string, defaultPort: number) => {
    if (!isProd) return `http://localhost:${defaultPort}`;

    const envKey = `REACT_APP_${serviceName.toUpperCase().replace(/-/g, "_")}_API`;
    const envVal = (process.env as any)[envKey];
    if (envVal) return envVal;

    if (window.location.hostname.includes("onrender.com")) {
        const fullHost = window.location.hostname;
        const hostParts = fullHost.split(".")[0].split("-");

        let prefix = "devsyncpro";
        const uiIndex = hostParts.indexOf("ui");
        if (uiIndex > 0) {
            prefix = hostParts.slice(0, uiIndex).join("-");
        }

        // Discovery Order: 
        // 1. [prefix]-[service].onrender.com (Blueprint default)
        // 2. [prefix]-3.onrender.com (Observed in screenshot as a Docker service)
        // 3. [prefix].onrender.com (Direct name)

        console.log(`CONFIG_DISCOVERY: Service [${serviceName}] searching for prefix [${prefix}]`);
        return `https://${prefix}-${serviceName}.onrender.com`.replace("--", "-");
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











