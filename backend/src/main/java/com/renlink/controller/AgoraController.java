package com.renlink.controller;

import com.renlink.service.AgoraTokenService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/agora")
public class AgoraController {

    private final AgoraTokenService agoraTokenService;

    @Value("${agora.app-id:}")
    private String appId;

    public AgoraController(AgoraTokenService agoraTokenService) {
        this.agoraTokenService = agoraTokenService;
    }

    @GetMapping("/app-id")
    public ResponseEntity<Map<String, String>> getAppId() {
        return ResponseEntity.ok(Map.of("appId", appId));
    }

    @GetMapping("/token")
    public ResponseEntity<Map<String, Object>> generateToken(
        @RequestParam String channelName,
        @RequestParam(required = false, defaultValue = "0") int uid
    ) {
        String token = agoraTokenService.generateRtcToken(channelName, uid);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("token", token);
        response.put("channelName", channelName);
        response.put("uid", uid);
        response.put("appId", appId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/token/account")
    public ResponseEntity<Map<String, Object>> generateTokenWithAccount(
        @RequestParam String channelName,
        @RequestParam String userAccount
    ) {
        String token = agoraTokenService.generateRtcTokenWithAccount(channelName, userAccount);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("token", token);
        response.put("channelName", channelName);
        response.put("userAccount", userAccount);
        response.put("appId", appId);
        return ResponseEntity.ok(response);
    }
}
