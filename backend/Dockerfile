FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data/meteor_showers.json ./data/meteor_showers.json
COPY data/samples ./data/samples
COPY data/replay-seed ./data/replay-seed

ENV TSUKUYOMI_DATA_DIR=/app/data \
    TSUKUYOMI_CORS_ORIGINS=http://localhost:5173,http://localhost:3000 \
    TSUKUYOMI_REPLAY_MODE=fallback

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://localhost:8000/api/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
