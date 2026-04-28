FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Expose the port the backend runs on
EXPOSE 5000

# Start the Node.js backend
CMD ["npm", "start"]
