package com.films.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Configures Cross-Origin Resource Sharing so the frontend (running on a
 * different port/domain) can call this API without the browser blocking it.
 *
 * @Configuration marks this class as a source of @Bean definitions —
 * Spring will pick it up on startup and apply the CORS rules globally.
 */
@Configuration
public class CorsConfig {

    /**
     * Read the allowed origin from application.properties.
     * Falls back to "*" (all origins) if the property is not set —
     * useful during local development but should be restricted in production.
     */
    @Value("${app.cors.allowed-origin:*}")
    private String allowedOrigin;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(@NonNull CorsRegistry registry) {
                registry
                    .addMapping("/api/**")      // only apply CORS to our API routes
                    .allowedOrigins(allowedOrigin)
                    .allowedMethods("GET", "POST")  // GET for reads + POST for batch lookups
                    .allowedHeaders("*")
                    .maxAge(3600);              // browser can cache the preflight for 1 h
            }
        };
    }
}
