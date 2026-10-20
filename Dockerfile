FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

RUN npm ci --only=production

COPY migrations/ ./migrations/
COPY admin/ ./admin/

EXPOSE 3000

CMD ["node", "dist/main.js"]
