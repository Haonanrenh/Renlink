package com.renlink.controller;

import com.renlink.dto.SubtitleSyncRequest;
import com.renlink.service.SubtitleService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/subtitles")
public class SubtitleController {

    private final SubtitleService subtitleService;

    public SubtitleController(SubtitleService subtitleService) {
        this.subtitleService = subtitleService;
    }

    @PostMapping("/share")
    public ResponseEntity<Map<String, Object>> shareSubtitle(
        @RequestBody SubtitleSyncRequest request,
        Authentication authentication
    ) {
        String senderUsername = authentication != null ? authentication.getName() : null;
        subtitleService.shareSubtitle(senderUsername, request);

        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "字幕已同步"
        ));
    }
}
