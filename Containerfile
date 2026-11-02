# syntax=docker/dockerfile:1

# --- Build (Angular, statisk browser-build) ---
FROM node:22-bookworm AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime (statisk nginx, körs som icke-root på port 8080) ---
FROM docker.io/nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/ksp-transfer-window/browser/ /usr/share/nginx/html/
EXPOSE 8080
