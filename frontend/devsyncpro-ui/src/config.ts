const isProd = window.location.protocol === "https:";
const wsProtocol = isProd ? "wss:" : "ws:";
const wsHost = process.env.REACT_APP_WS_URL || (isProd ? `relay.${window.location.host}` : "localhost:9000/ws");

export const CONFIG = {
    SCANNER_API: process.env.REACT_APP_SCANNER_API || "http://localhost:8081",
    ORCHESTRATOR_API: process.env.REACT_APP_ORCHESTRATOR_API || "http://localhost:8082",
    ANALYZER_API: process.env.REACT_APP_ANALYZER_API || "http://localhost:8083",
    WS_URL: process.env.REACT_APP_WS_URL ? process.env.REACT_APP_WS_URL : `${wsProtocol}//${wsHost}`
};


