FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node gateway ./gateway
RUN mkdir /data && chown node:node /data
USER node
CMD ["node","gateway/run.mjs","/run/imperium/config.json"]
