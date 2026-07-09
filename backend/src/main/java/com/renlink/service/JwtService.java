package com.renlink.service;

import com.renlink.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {
    
    @Value("${jwt.secret}")
    private String secretKey;
    
    @Value("${jwt.expiration}")
    private Long expiration;
    
    /**
     * 生成 JWT Token
     * @param user 用户实体
     * @return JWT Token 字符串
     */
    public String generateToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", user.getId());
        
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(user.getUsername())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }
    
    /**
     * 从 Token 中提取用户名
     * @param token JWT Token
     * @return 用户名
     */
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /**
     * 验证 Token 并返回用户名，避免调用方重复解析同一个 JWT。
     * @param token JWT Token
     * @return Token 中的用户名
     */
    public String validateAndExtractUsername(String token) {
        Claims claims = extractAllClaims(token);
        Date expirationDate = claims.getExpiration();
        if (expirationDate == null || expirationDate.before(new Date())) {
            throw new IllegalArgumentException("JWT token expired");
        }

        String username = claims.getSubject();
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("JWT subject cannot be blank");
        }

        return username;
    }
    
    /**
     * 验证 Token 是否有效
     * @param token JWT Token
     * @param username 用户名
     * @return 是否有效
     */
    public boolean validateToken(String token, String username) {
        final String extractedUsername = validateAndExtractUsername(token);
        return extractedUsername.equals(username);
    }
    
    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }
    
    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }
    
    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }
    
    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(normalizeToken(token))
                .getBody();
    }
    
    private Key getSigningKey() {
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException("JWT_SECRET must be configured");
        }

        byte[] keyBytes = secretKey.trim().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            try {
                keyBytes = MessageDigest.getInstance("SHA-256").digest(keyBytes);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("Unable to initialize JWT signing key", e);
            }
        }

        return Keys.hmacShaKeyFor(keyBytes);
    }

    private String normalizeToken(String token) {
        if (token == null) {
            throw new IllegalArgumentException("JWT token cannot be null");
        }

        String normalized = token.trim();
        if (normalized.startsWith("Bearer ")) {
            normalized = normalized.substring(7).trim();
        }

        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("JWT token cannot be blank");
        }

        return normalized;
    }
}
