FROM postgres:15-alpine
# Install missing locale support for Alpine
# RUN apk add --no-bin-cache icu-libs icu-data-full locale-conf-pkg
RUN apk add --no-cache icu-libs icu-data-full
COPY init.sql /docker-entrypoint-initdb.d/init.sql