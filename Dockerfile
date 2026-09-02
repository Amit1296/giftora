FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Fail the build if any Product schema is invalid (missing image/price/etc.)
# so a schema regression can never reach production.
RUN node seo/check-schema.js

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
