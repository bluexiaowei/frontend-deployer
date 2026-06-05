FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src/ ./
EXPOSE 4000
CMD ["node", "server.js"]