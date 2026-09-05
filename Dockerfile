# Frontend (Vite + React). Multi-stage: deps -> dev / build -> runtime (nginx).

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: Vite dev server (compose bind-mounts the source over this) ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: production bundle ----
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# ---- runtime: static files behind nginx ----
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
