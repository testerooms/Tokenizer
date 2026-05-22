FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/proxy/package.json packages/proxy/
RUN npm install --workspaces

COPY packages/shared/ packages/shared/
COPY packages/proxy/ packages/proxy/
RUN npm run build --workspace=packages/shared && npm run build --workspace=packages/proxy

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/proxy/dist ./packages/proxy/dist
COPY --from=build /app/packages/proxy/package.json ./packages/proxy/
COPY --from=build /app/packages/proxy/node_modules ./packages/proxy/node_modules

ENV NODE_ENV=production
ENV DB_PATH=/data/guardian.db
EXPOSE 3001
CMD ["dumb-init", "node", "packages/proxy/dist/index.js"]
