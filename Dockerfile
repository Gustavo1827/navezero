FROM node:22-alpine
WORKDIR /app
COPY package.json server.js websocket.js index.html ./
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["npm", "start"]
