# Same Node-RED base digest as the existing workspace container.
FROM nodered/node-red@sha256:2ccd38b4066648bd5e17430c50a2f8102c566a82fd4f2fc5c342e61664d6896f
USER root
RUN apk add --no-cache alsa-lib alsa-utils \
    && apk add --no-cache --virtual .midi-build python3 make g++ linux-headers alsa-lib-dev \
    && npm install --prefix /usr/src/node-red --omit=dev --no-audit --no-fund --save-exact node-red-contrib-midi@1.1.2 @flowfuse/node-red-dashboard@1.34.1 ws@7.5.13 \
    && apk del .midi-build
COPY servorack-midi /usr/src/node-red/node_modules/node-red-contrib-servorack-midi
COPY servorack-connection /usr/src/node-red/node_modules/node-red-contrib-servorack-connection
COPY flows.json persistent-context.js bootstrap.cjs start.sh /opt/servorack/
# Remove the base image's example worksheet, not any mounted user data.
RUN rm -f /data/flows.json && chmod +x /opt/servorack/start.sh
USER node-red
ENTRYPOINT ["/opt/servorack/start.sh"]
