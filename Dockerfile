# backend — Flask + Gunicorn
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gcc \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
-o /usr/local/bin/supercronic && \
chmod +x /usr/local/bin/supercronic

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY docker/kefu.crontab /etc/crontab

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN mkdir -p /app/reports /app/analyze /app/analyze_summary/daily /app/analyze_summary/weekly /app/analyze_summary/monthly /app/knowledge

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "2", "--timeout", "120", "app:app"]