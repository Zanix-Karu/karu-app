# Karu API — production image.
# Build from the REPO ROOT (the pnpm workspace is the build context):
#   docker build -f apps/api/Dockerfile -t karu-api .
# Run:
#   docker run -p 3000:3000 --env-file .env karu-api

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo

# Install with a warm layer cache: manifests first, sources after.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @karu/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
# nest build + tsc-alias: dist is self-contained (compiled @karu/shared
# included, path aliases rewritten to relative requires, no spec files).
RUN pnpm --filter @karu/api run build

# Standalone production bundle: package + prod-only node_modules + dist.
# --legacy: pnpm v10 otherwise demands inject-workspace-packages, which this
# workspace doesn't use; dist already inlines @karu/shared via tsc-alias.
RUN pnpm --filter @karu/api deploy --legacy --prod /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
EXPOSE 3000
USER node
CMD ["node", "dist/apps/api/src/main.js"]
