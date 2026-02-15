const isProd = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Helper to construct Render URLs if env vars are missing
const getRenderUrl = (serviceName: string, defaultPort: number) => {
    if (!isProd) return `http://localhost:${defaultPort}`;
    // If we're on a sub-domain of onrender.com, we can try to find the peer services
    if (window.location.hostname.includes("onrender.com")) {
        const root = window.location.hostname.split(".")[0].replace("-ui", "");
        return `https://${root}-${serviceName}.onrender.com`;
    }
    return `http://localhost:${defaultPort}`; // Final fallback
};

export const CONFIG = {
    SCANNER_API: process.env.REACT_APP_SCANNER_API || getRenderUrl("repo-scanner", 8081),
    ORCHESTRATOR_API: process.env.REACT_APP_ORCHESTRATOR_API || getRenderUrl("orchestrator", 8082),
    ANALYZER_API: process.env.REACT_APP_ANALYZER_API || getRenderUrl("ai-analyzer", 8083),
    WS_URL: process.env.REACT_APP_WS_URL || `${wsProtocol}//${getRenderUrl("relay", 9000).replace("https://", "").replace("http://", "")}/ws`
};



