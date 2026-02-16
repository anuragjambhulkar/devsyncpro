FROM node:20-alpine
WORKDIR /app
# Context set to root in render.yaml
COPY websocket-server/package*.json ./
RUN npm install
COPY websocket-server/ .
EXPOSE 10000
CMD ["node", "server.js"]
