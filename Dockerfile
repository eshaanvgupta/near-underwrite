FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY db ./db
COPY scripts/static-server.mjs ./scripts/static-server.mjs
RUN pnpm install --frozen-lockfile
ARG VITE_REGISTRY_CONTRACT_ID
ARG VITE_API_URL=/api
ENV VITE_REGISTRY_CONTRACT_ID=$VITE_REGISTRY_CONTRACT_ID VITE_API_URL=$VITE_API_URL
RUN pnpm -r --if-present build

FROM node:24.16.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8787 4173
CMD ["node", "apps/api/dist/server.js"]
