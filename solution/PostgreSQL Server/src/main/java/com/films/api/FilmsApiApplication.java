package com.films.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Application entry point.
 *
 *   @SpringBootApplication     is a convenience annotation that combines:
 *   @Configuration             - marks this class as a source of bean definitions
 *   @EnableAutoConfiguration   - tells Spring Boot to configure itself based on
 *                              the JARs on the classpath in pom.xml (e.g. auto-setup JPA,
 *                              Tomcat, Jackson because those JARs are present)
 *   @ComponentScan             - scans this package and all sub-packages for
 *                              @Component, @Service, @Repository, @Controller, etc.
 */
@SpringBootApplication
public class FilmsApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(FilmsApiApplication.class, args);
    }
}
