FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose Vite's default dev server port if we were using it, 
# but docker-compose maps 3001:3000. Let's make vite run on port 3000
EXPOSE 3000

# Start Vite on port 3000 so it matches the docker-compose mapping
CMD ["npm", "run", "dev", "--", "--port", "3000", "--host", "0.0.0.0"]
