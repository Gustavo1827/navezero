FROM node:22-alpine
WORKDIR /app
COPY package.json server.js static-files.js websocket.js index.html languages.json exclusive-cosmetics.json ./
COPY assets ./assets
COPY scripts ./scripts
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["npm", "start"]
