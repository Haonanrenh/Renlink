package com.renlink.controller;

import com.renlink.dto.XfyunTtsSessionResponse;
import com.renlink.service.XfyunTtsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tts")
public class TtsController {

    @Autowired
    private XfyunTtsService xfyunTtsService;

    @PostMapping("/xfyun/session")
    public ResponseEntity<XfyunTtsSessionResponse> createXfyunTtsSession(Authentication authentication) {
        try {
            String username = authentication != null ? authentication.getName() : "anonymous";
            return ResponseEntity.ok(xfyunTtsService.createSignedSession(username));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new XfyunTtsSessionResponse(
                    false,
                    "xfyun-online-tts",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    e.getMessage()
                ));
        }
    }
}
