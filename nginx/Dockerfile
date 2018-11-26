FROM nginx:alpine

# Remove any existing config files
RUN rm /etc/nginx/conf.d/*

# Copy custom config file
# All files in "/etc/nginx/conf.d/" dir get merged into main config
COPY ./default.conf /etc/nginx/conf.d/
