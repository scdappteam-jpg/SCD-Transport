FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libzbar0 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-lite.txt .
RUN pip install --no-cache-dir -r requirements-lite.txt
COPY . .
EXPOSE 10000
CMD ["sh", "-c", "SCAN_PORT=${PORT:-5000} python app.py"]
