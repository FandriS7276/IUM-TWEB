# ==============================================================================
# Dockerfile — PostgreSQL Server (Spring Boot / Maven)
# Multi-stage: build with Maven, run with slim JRE
# ==============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Copy pom first for layer caching — dependencies only re-download when pom changes
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

COPY --from=build /app/target/*.jar app.jar

# Declare expected environment variables (values are injected at runtime via --env-file or docker-compose)
ENV DB_HOST=localhost \
    DB_PORT=5432 \
    DB_NAME= \
    DB_USER= \
    DB_PASSWORD=

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
