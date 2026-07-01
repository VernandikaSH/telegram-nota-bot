FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund || npm install --production --no-audit --no-fund

COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
