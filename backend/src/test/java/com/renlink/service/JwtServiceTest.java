package com.renlink.service;

import com.renlink.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    @Test
    void generatedTokenCanBeValidatedForUser() {
        JwtService jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secretKey", "renlink-test-secret-key-with-at-least-32-bytes");
        ReflectionTestUtils.setField(jwtService, "expiration", 86_400_000L);

        User user = new User();
        user.setId(1L);
        user.setUsername("test1");

        String token = jwtService.generateToken(user);

        assertEquals("test1", jwtService.extractUsername(token));
        assertTrue(jwtService.validateToken(token, "test1"));
    }

    @Test
    void missingSecretFailsFast() {
        JwtService jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secretKey", "");
        ReflectionTestUtils.setField(jwtService, "expiration", 86_400_000L);

        User user = new User();
        user.setId(1L);
        user.setUsername("test1");

        assertThrows(IllegalStateException.class, () -> jwtService.generateToken(user));
    }
}
