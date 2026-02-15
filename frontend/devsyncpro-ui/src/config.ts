const isProd = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

// Helper to construct Render URLs if env vars are missing
const getRenderUrl = (serviceName: string, defaultPort: number) => {
    if (!isProd) return `http://localhost:${defaultPort}`;

    // 1. Try predefined Env Var (Mapped via Render Blueprint)
    const envKey = `REACT_APP_${serviceName.toUpperCase().replace(/-/g, "_")}_API`;
    const envVal = (process.env as any)[envKey];
    if (envVal) return envVal;

    // 2. Intelligent Auto-Detection for Render Environments
    if (window.location.hostname.includes("onrender.com")) {
        const hostName = window.location.hostname.split(".")[0];

        // Strategy: Detect project prefix by stripping UI suffixes
        // Example: 'devsyncpro-ui-static' -> 'devsyncpro'
        const systemBase = hostName.split("-ui")[0].replace("-static", "");

        // Expected URL: https://[systemBase]-[serviceName].onrender.com
        // We avoid adding '-static' to the service name as it's almost always wrong for backends
        return `https://${systemBase}-${serviceName}.onrender.com`.replace("--", "-");
    }
    return `http://localhost:${defaultPort}`;
};

export const CONFIG = {
    SCANNER_API: getRenderUrl("repo-scanner", 8081),
    ORCHESTRATOR_API: getRenderUrl("orchestrator", 8082),
    ANALYZER_API: getRenderUrl("ai-analyzer", 8083),
    WS_URL: `${wsProtocol}//${getRenderUrl("relay", 9000).replace("https://", "").replace("http://", "")}/ws`
};






