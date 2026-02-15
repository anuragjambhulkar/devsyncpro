from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from typing import List, Optional
import datetime
import os
import json

try:
    import vertexai
    from vertexai.generative_models import GenerativeModel
    VERTEX_AVAILABLE = True
except ImportError:
    VERTEX_AVAILABLE = False
    print("Pre-requisite 'google-cloud-aiplatform' not found. AI Analyzer starting in MOCK mode.")

app = FastAPI(title="DevSyncPro AI Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    fix_suggestion: Optional[str] = None

class RefactorRequest(BaseModel):
    code_context: str
    file_path: Optional[str] = None
    focus_area: Optional[str] = "performance"

class RefactorResponse(BaseModel):
    original_code: str
    refactored_code: str
    explanation: str
    estimated_impact: str

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
            1. Root cause (detailed engineering analysis)
            2. 4-5 Specific remediation steps
            3. A high-quality code fix suggestion in markdown (if applicable)
            4. Confidence score (0-1)
            
            Return ONLY JSON format:
            {{
                "root_cause": "...",
                "remediation_steps": ["step1", "step2", ...],
                "fix_suggestion": "```...```",
                "confidence_score": 0.95
            }}
            """
            response = model.generate_content(prompt)
            text = response.text
            start = text.find("{{")
            end = text.rfind("}}") + 1
            if start == -1: # fallback to simple { }
                start = text.find("{")
                end = text.rfind("}") + 1

            if start != -1 and end != -1:
                data = json.loads(text[start:end])
                return AnalysisResponse(
                    incident_id=incident.id,
                    root_cause=data.get("root_cause", "AI analysis completed."),
                    remediation_steps=data.get("remediation_steps", []),
                    confidence_score=data.get("confidence_score", 0.9),
                    fix_suggestion=data.get("fix_suggestion")
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
        confidence_score=0.8,
        fix_suggestion="```python\n# Potential fix: increase pool size\nPOOL_SIZE = 20\n```"
    )

@app.post("/refactor", response_model=RefactorResponse)
async def refactor_code(req: RefactorRequest):
    if model:
        try:
            prompt = f"""
            Refactor this code for {req.focus_area}. 
            File Context: {req.file_path or "Unknown"}
            
            Code:
            {req.code_context}
            
            Provide:
            1. Refactored code (high performance, modern patterns)
            2. Clear explanation of changes
            3. Estimated impact
            
            Return ONLY JSON format:
            {{
                "refactored_code": "...",
                "explanation": "...",
                "estimated_impact": "..."
            }}
            """
            response = model.generate_content(prompt)
            text = response.text
            start = text.find("{")
            end = text.rfind("}") + 1
            if start != -1 and end != -1:
                data = json.loads(text[start:end])
                return RefactorResponse(
                    original_code=req.code_context,
                    refactored_code=data.get("refactored_code", req.code_context),
                    explanation=data.get("explanation", "Optimized code for efficiency."),
                    estimated_impact=data.get("estimated_impact", "Medium")
                )
        except Exception as e:
            print(f"Vertex AI refactor failed: {e}")

    return RefactorResponse(
        original_code=req.code_context,
        refactored_code=f"// [Mock Refactor]\n{req.code_context}\n// Added caching and parallelization",
        explanation="MOCK MODE: Simulated performance optimization and code cleanup.",
        estimated_impact="High Performance Improvement"
    )

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)
