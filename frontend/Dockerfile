FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend ./frontend
RUN npm ci --ignore-scripts

WORKDIR /app/frontend
# 构建世界入口（virtual-utopia），如需其他入口改对应 vite 配置
RUN npx vite build --config src/virtual-utopia/vite.config.js

FROM node:24-alpine

WORKDIR /app/frontend
COPY --from=build /app/frontend/dist ./dist
COPY --from=build /app/frontend/node_modules ./node_modules

EXPOSE 5175
CMD ["node", "node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", "5175"]
