FROM python:3.11-slim

WORKDIR /app
COPY backend/ai-analyzer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ai-analyzer/analyzer.py .

EXPOSE 10000
CMD ["uvicorn", "analyzer:app", "--host", "0.0.0.0", "--port", "10000"]
