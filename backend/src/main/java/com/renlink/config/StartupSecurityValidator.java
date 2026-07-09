package com.renlink.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

@Component
public class StartupSecurityValidator implements ApplicationRunner {

    private final Environment environment;

    @Value("${jwt.secret:}")
    private String jwtSecret;

    @Value("${spring.jpa.hibernate.ddl-auto:}")
    private String ddlAuto;

    @Value("${spring.h2.console.enabled:false}")
    private boolean h2ConsoleEnabled;

    @Value("${cors.allowed-origins:}")
    private String allowedOrigins;

    public StartupSecurityValidator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!isProdProfileActive()) {
            return;
        }

        require(jwtSecret != null && jwtSecret.trim().getBytes(StandardCharsets.UTF_8).length >= 32,
            "JWT_SECRET must be configured with at least 32 bytes in prod");
        require(!"create-drop".equalsIgnoreCase(ddlAuto),
            "DDL_AUTO=create-drop is forbidden in prod");
        require(!h2ConsoleEnabled, "H2 console must be disabled in prod");
        require(allowedOrigins != null && !allowedOrigins.isBlank() && !allowedOrigins.contains("*"),
            "RENLINK_ALLOWED_ORIGINS must be explicit in prod");
    }

    private boolean isProdProfileActive() {
        return Arrays.asList(environment.getActiveProfiles()).contains("prod");
    }

    private void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalStateException(message);
        }
    }
}
