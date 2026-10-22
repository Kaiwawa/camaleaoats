FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data

ENV PORT=3000
ENV CAMALEAO_DB_PATH=/app/data/camaleao.db

EXPOSE 3000

CMD ["node", "src/server.ts"]
