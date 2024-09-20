FROM public.ecr.aws/docker/library/node:20.9.0-slim AS base

RUN mkdir /app
WORKDIR /app

FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

FROM base as builder

COPY . .
COPY --from=deps /app/node_modules ./node_modules

# declare the sharp path to be /tmp/node_modules/sharp
ENV NEXT_SHARP_PATH=/tmp/node_modules/sharp
# install the dependencies and build the app
# disables nextjs telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM public.ecr.aws/docker/library/node:20.9.0-slim AS runner
# install aws-lambda-adapter extension
# https://aws.amazon.com/blogs/compute/working-with-lambda-layers-and-extensions-in-container-images/
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter
# expose port 3000 and set env variables
ENV PORT=3000 NODE_ENV=production
ENV AWS_LWA_ENABLE_COMPRESSION=true
WORKDIR /app

FROM base as release

COPY ./bin/lambda-server.sh ./run.sh

# copy static files and images from build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN ln -s /tmp/cache ./.next/cache

EXPOSE 8080

CMD exec ./run.sh
