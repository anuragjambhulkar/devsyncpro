FROM node:20-alpine
WORKDIR /app
# Context will be set to websocket-server in render.yaml
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 10000
CMD ["node", "server.js"]
