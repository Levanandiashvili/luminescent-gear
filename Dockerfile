# Luminescent Mastering website: a small Node.js server (no packages) with an admin panel at /admin.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY content ./content
COPY public ./public
# The texts Levan saves live on Railway's volume, mounted at /data.
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["node", "--max-old-space-size=96", "server.js"]
