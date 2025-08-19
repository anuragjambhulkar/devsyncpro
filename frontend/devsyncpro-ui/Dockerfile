FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
ENV CHOKIDAR_USEPOLLING=true
CMD ["npm", "start"]
