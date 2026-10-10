FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server
ENV NODE_ENV=production PORT=8080 DB_FILE=/data/ontheline.db
VOLUME /data
EXPOSE 8080
CMD ["node", "--no-warnings", "server/server.js"]
