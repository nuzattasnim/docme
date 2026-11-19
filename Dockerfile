# Blocks Release build: static Vite bundle served by unprivileged nginx on 8080.
# Release passes `ci_build=<environment>` plus the public VITE_BLOCKS_* values
# (from the repo's secret set — see `blocks release secrets sync`) as build args.
# Only client-safe values belong here: never passwords, tokens or client secrets.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ARG ci_build=dev
ARG VITE_BLOCKS_API_URL
ARG VITE_BLOCKS_PROJECT_KEY
ARG VITE_BLOCKS_OIDC_CLIENT_ID
ARG VITE_BLOCKS_OIDC_URL=https://iam.seliseblocks.com
# Optional: leave empty so the app uses <its own origin>/login/callback.
ARG VITE_BLOCKS_REDIRECT_URI=
# Admin tools (SPEC1 data migration, SPEC2 S0 probe). Off unless the repo's
# secret set turns them on for a temporary tools deploy; turn them off again after.
ARG VITE_ENABLE_MIGRATION=false
ARG VITE_ENABLE_SPIKE=false
# SPEC3 E2E console helper (window.__docmeDev.comments). Same rule: temporary only.
ARG VITE_ENABLE_DEV_TOOLS=false

ENV VITE_BLOCKS_API_URL=${VITE_BLOCKS_API_URL} \
    VITE_BLOCKS_PROJECT_KEY=${VITE_BLOCKS_PROJECT_KEY} \
    VITE_BLOCKS_OIDC_CLIENT_ID=${VITE_BLOCKS_OIDC_CLIENT_ID} \
    VITE_BLOCKS_OIDC_URL=${VITE_BLOCKS_OIDC_URL} \
    VITE_BLOCKS_REDIRECT_URI=${VITE_BLOCKS_REDIRECT_URI} \
    VITE_ENABLE_MIGRATION=${VITE_ENABLE_MIGRATION} \
    VITE_ENABLE_SPIKE=${VITE_ENABLE_SPIKE} \
    VITE_ENABLE_DEV_TOOLS=${VITE_ENABLE_DEV_TOOLS}

RUN npx tsc -b \
  && NODE_OPTIONS="--max-old-space-size=4096" npx vite build --mode "${ci_build}"

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
