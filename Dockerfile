FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY README.md ./README.md
EXPOSE 7000
CMD ["node", "src/server.js"]
