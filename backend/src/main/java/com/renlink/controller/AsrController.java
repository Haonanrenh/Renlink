package com.renlink.controller;

import com.renlink.dto.XfyunSessionRequest;
import com.renlink.dto.XfyunSessionResponse;
import com.renlink.service.XfyunRtasrService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/asr")
public class AsrController {

    @Autowired
    private XfyunRtasrService xfyunRtasrService;

    @PostMapping("/xfyun/session")
    public ResponseEntity<XfyunSessionResponse> createXfyunSession(
            @RequestBody(required = false) XfyunSessionRequest request,
            Authentication authentication) {

        XfyunSessionRequest safeRequest = request != null ? request : new XfyunSessionRequest();

        try {
            String username = authentication != null ? authentication.getName() : "anonymous";
            XfyunSessionResponse response = xfyunRtasrService.createSignedSession(safeRequest, username);
            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new XfyunSessionResponse(
                        false,
                        "xfyun-rtasr-llm",
                        null,
                        safeRequest.getLang(),
                        "pcm_s16le",
                        16000,
                        1280,
                        40,
                        e.getMessage()
                    ));
        }
    }
}
