FROM node:18-alpine AS react-build
WORKDIR /app/react
COPY ./frontend/package*.json ./
RUN npm install
COPY ./frontend/ .
RUN npm run build

FROM python:3.9-slim AS django-build
WORKDIR /app
COPY ./backend/livraison/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ./backend/livraison/ .

FROM python:3.9-slim AS fastapi-build
WORKDIR /app
COPY ./backend/match_position/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ./backend/match_position/ .

FROM python:3.9-slim
WORKDIR /app

RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

COPY --from=react-build /app/react/build /var/www/html

COPY --from=django-build /usr/local/lib/python3.9/site-packages /usr/local/lib/python3.9/site-packages
COPY --from=django-build /app /app/django

COPY --from=fastapi-build /usr/local/lib/python3.9/site-packages /usr/local/lib/python3.9/site-packages
COPY --from=fastapi-build /app /app/fastapi

COPY nginx/nginx-single.conf /etc/nginx/sites-available/default
RUN ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

EXPOSE 80

CMD sh -c "cd /app/django && python manage.py migrate && \
    nginx && \
    python manage.py runserver 0.0.0.0:8000 & \
    cd /app/fastapi && uvicorn main:app --host 0.0.0.0 --port 8001 & \
    wait"
