# Use the official Python 3.10 image which is perfectly compatible with TensorFlow
FROM python:3.10-slim

# Set working directory inside the container
WORKDIR /app

# Copy the requirements file first to optimize Docker build caching
COPY backend/requirements.txt .

# Install all Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code
COPY backend/ .

# The PORT environment variable is injected by Railway automatically
# Start the Gunicorn server
CMD gunicorn app:app -w 2 -b 0.0.0.0:$PORT --preload --timeout 120
