# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY signaling-server/package*.json ./signaling-server/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm install --workspace=@remoted/signaling-server --workspace=@remoted/shared

# Copy source code
COPY shared/ ./shared/
COPY signaling-server/ ./signaling-server/

# Build the application
RUN npm run build --workspace=@remoted/shared
RUN npm run build --workspace=@remoted/signaling-server

# Expose port (Railway and fly.io will override with their own PORT env var)
EXPOSE 8080

# Set working directory to signaling server
WORKDIR /app/signaling-server

# Start the server
CMD ["node", "dist/server.js"]
