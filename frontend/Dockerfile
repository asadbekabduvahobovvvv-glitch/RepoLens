FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine

# Local Docker Compose uses backend:8000. Railway overrides this with
# backend.railway.internal:8000 through the service environment.
ENV BACKEND_HOST=backend:8000

COPY --chown=101:101 nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080
