from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import datetime
import os
try:
    import vertexai
    from vertexai.generative_models import GenerativeModel
    VERTEX_AVAILABLE = True
except ImportError:
    VERTEX_AVAILABLE = False
    print("Pre-requisite 'google-cloud-aiplatform' not found. AI Analyzer starting in MOCK mode.")

app = FastAPI(title="DevSyncPro AI Analyzer")

# --- Vertex AI Config ---
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

model = None
try:
    if PROJECT_ID and VERTEX_AVAILABLE:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        model = GenerativeModel("gemini-1.5-flash")
        print(f"Vertex AI initialized for project {PROJECT_ID}")
except Exception as e:
    print(f"Vertex AI init failed: {e}")

class IncidentData(BaseModel):
    id: int
    type: str
    service: str
    message: str

class AnalysisResponse(BaseModel):
    incident_id: int
    root_cause: str
    remediation_steps: List[str]
    confidence_score: float

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_incident(incident: IncidentData):
    if model:
        try:
            prompt = f"""
            Analyze this engineering incident:
            Service: {incident.service}
            Type: {incident.type}
            Log Message: {incident.message}
            
            Provide:
            1. Root cause (one sentence)
            2. 3 Remediation steps
            3. Confidence score (0-1)
            
            Return ONLY JSON format:
            {{"root_cause": "...", "remediation_steps": ["step1", "step2", "step3"], "confidence_score": 0.95}}
            """
            response = model.generate_content(prompt)
            import json
            # Extract JSON from response text (naive search for {{)
            text = response.text
            start = text.find("{{")
            end = text.rfind("}}") + 1
            if start != -1 and end != -1:
                data = json.loads(text[start:end])
                return AnalysisResponse(
                    incident_id=incident.id,
                    root_cause=data.get("root_cause", "AI analysis completed."),
                    remediation_steps=data.get("remediation_steps", []),
                    confidence_score=data.get("confidence_score", 0.9)
                )
        except Exception as e:
            print(f"Vertex AI analysis failed: {e}")

    # Fallback to mock logic
    analysis_map = {
        "Database": "Connection pool exhaustion detected in high-traffic periods.",
        "Network": "Latency spike observed in regional peering link.",
        "Auth": "Expired certificate on the identity provider side.",
        "Compute": "Memory leak in the main request handler loop."
    }
    cause = analysis_map.get(incident.service, "Unexpected anomaly detected in service logs.")
    return AnalysisResponse(
        incident_id=incident.id,
        root_cause=f"[Mock] {cause}",
        remediation_steps=[
            "Verify service logs for specific error codes.",
            "Check recent deployment diffs.",
            "Run automated rollback if fallback persists."
        ],
        confidence_score=0.8
    )

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)
