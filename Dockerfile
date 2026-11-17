# Luminescent Mastering website: one static page served by nginx on Railway.
FROM nginx:stable-alpine

# One worker is plenty for a one-page site; "auto" starts one per host CPU (dozens on Railway),
# and every worker costs memory, which Railway bills.
RUN sed -i 's/^worker_processes .*/worker_processes 1;/' /etc/nginx/nginx.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html luminescent-mastering-mix-guide.pdf /usr/share/nginx/html/

EXPOSE 8080
