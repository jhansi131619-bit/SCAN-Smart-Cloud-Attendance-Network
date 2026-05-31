# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app


# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p known_faces backup projects/known_faces

# Expose port
EXPOSE 5002

# Set environment variables
ENV FLASK_ENV=production
ENV FLASK_DEBUG=false
ENV PORT=5002

# Run the application
CMD ["python", "app.py"]