FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Persistent directories (mount these as volumes in Coolify)
RUN mkdir -p data uploads/images

EXPOSE 3000

CMD ["node", "server.js"]
