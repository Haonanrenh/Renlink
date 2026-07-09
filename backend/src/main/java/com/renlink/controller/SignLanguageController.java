package com.renlink.controller;

import com.renlink.dto.SignLanguageInitResponse;
import com.renlink.service.SignLanguageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/sign-language")
public class SignLanguageController {

    private final SignLanguageService signLanguageService;

    public SignLanguageController(SignLanguageService signLanguageService) {
        this.signLanguageService = signLanguageService;
    }

    @GetMapping("/init")
    public ResponseEntity<SignLanguageInitResponse> getInitParams() {
        if (!signLanguageService.isEnabled()) {
            return ResponseEntity.ok(SignLanguageInitResponse.error("手语功能未启用或未配置"));
        }

        return ResponseEntity.ok(SignLanguageInitResponse.success("server-managed"));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(Map.of(
            "enabled", signLanguageService.isEnabled(),
            "credentialMode", "server-managed"
        ));
    }
}
