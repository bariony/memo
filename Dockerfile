FROM node:20-alpine

# Needed to transcode WhatsApp voice notes (ogg/Opus) into a format
# OpenAI's transcription API actually accepts - ogg isn't in its supported
# input list.
RUN apk add --no-cache ffmpeg

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

CMD ["sh", "-c", "npx tsx migrations/run.ts && node dist/main.js"]
