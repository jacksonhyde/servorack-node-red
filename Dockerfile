# Same Node-RED base digest as the existing workspace container.
FROM nodered/node-red@sha256:2ccd38b4066648bd5e17430c50a2f8102c566a82fd4f2fc5c342e61664d6896f
USER root
RUN apk add --no-cache alsa-lib alsa-utils \
    && apk add --no-cache --virtual .midi-build python3 make g++ linux-headers alsa-lib-dev \
    && npm install --prefix /usr/src/node-red --omit=dev --no-audit --no-fund --save-exact node-red-contrib-midi@1.1.2 @flowfuse/node-red-dashboard@1.34.1 \
    && apk del .midi-build
USER node-red
