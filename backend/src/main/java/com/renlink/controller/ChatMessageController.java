package com.renlink.controller;

import com.renlink.dto.ChatMessageDTO;
import com.renlink.dto.ChatMessageRequest;
import com.renlink.entity.User;
import com.renlink.service.ChatMessageService;
import com.renlink.service.CurrentUserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/messages")
public class ChatMessageController {

    private final ChatMessageService chatMessageService;
    private final CurrentUserService currentUserService;

    public ChatMessageController(ChatMessageService chatMessageService, CurrentUserService currentUserService) {
        this.chatMessageService = chatMessageService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/conversations/{friendUsername}")
    public ResponseEntity<List<ChatMessageDTO>> getConversation(
        @PathVariable String friendUsername,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        return ResponseEntity.ok(chatMessageService.getConversation(currentUser.getId(), friendUsername));
    }

    @GetMapping("/unread-summary")
    public ResponseEntity<Map<String, Object>> getUnreadSummary(Authentication authentication) {
        User currentUser = resolveCurrentUser(authentication);
        return ResponseEntity.ok(chatMessageService.getUnreadSummary(currentUser.getId()));
    }

    @PostMapping("/conversations/{friendUsername}/mark-read")
    public ResponseEntity<Map<String, Object>> markConversationAsRead(
        @PathVariable String friendUsername,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        long updatedCount = chatMessageService.markConversationAsRead(currentUser.getId(), friendUsername);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("updatedCount", updatedCount);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> sendMessage(
        @RequestBody @Valid ChatMessageRequest request,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        ChatMessageDTO message = chatMessageService.sendMessage(currentUser.getId(), request);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", message);
        return ResponseEntity.ok(response);
    }

    private User resolveCurrentUser(Authentication authentication) {
        return currentUserService.requireCurrentUser(authentication);
    }
}
