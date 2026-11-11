FROM php:8.2-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libzip-dev \
    && docker-php-ext-install pdo_mysql sockets bcmath zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Dépendances d'abord : cette couche est mise en cache tant que composer.* ne change pas.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction

COPY . .
RUN composer dump-autoload --optimize --no-dev --no-scripts \
    && chmod -R ug+rw storage bootstrap/cache

EXPOSE 8085

# Par défaut : l'API HTTP. Le consommateur RabbitMQ réutilise la même image (voir docker-compose.yml).
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8085"]
