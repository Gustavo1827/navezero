FROM node:22-alpine
WORKDIR /app
COPY package.json server.js static-files.js websocket.js index.html languages.json exclusive-cosmetics.json server-neutrals.js server-match.js server-gemini.js gemini-api.js bot-system-prompt.js ./
COPY assets ./assets
COPY scripts ./scripts
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["npm", "start"]
