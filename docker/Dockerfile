FROM containers.atc-github.azure.cloud.company-name/web/company-name-nginx-minimal-community:NGINX1.29.4_OPENSSL3.5.2_UBI9.7

ARG PROJECT_PATH

COPY dist/ahoy-frontend/browser /opt/app-root/src/ahoy-frontend

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/server.conf

EXPOSE 4200

USER 1001

CMD ["nginx", "-g", "daemon off;"]
