FROM node:22-alpine
WORKDIR /app
COPY package.json server.js websocket.js index.html languages.json exclusive-cosmetics.json ./
COPY assets ./assets
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["npm", "start"]
