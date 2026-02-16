FROM python:3.11-slim
WORKDIR /app
# Context will be set to backend/ai-analyzer in render.yaml
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 10000
CMD ["uvicorn", "analyzer:app", "--host", "0.0.0.0", "--port", "10000"]
