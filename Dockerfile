FROM node:20-slim

WORKDIR /app

# Install dependencies for server
COPY server/package*.json ./
RUN npm install

# Copy server code
COPY server/ ./

# Expose API port
ENV PORT=8787
EXPOSE 8787

# Start server
CMD ["npm", "start"]
