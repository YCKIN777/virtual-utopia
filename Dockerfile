FROM node:24-alpine

WORKDIR /app

# 仅复制运行所需（node_modules 由 npm ci 重建，dist 由构建生成）
COPY package.json package-lock.json ./
COPY backend ./backend
COPY scripts ./scripts
COPY migrations ./migrations

RUN npm ci --ignore-scripts

ENV NODE_ENV=production
EXPOSE 3000 3300 3400

# 默认入口为 phase5，phase6 / 其他服务通过 docker-compose 的 command 覆盖
CMD ["node", "backend/src/phase5/server.js"]
