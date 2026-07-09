package com.renlink.controller;

import com.renlink.dto.TypingStatusMessage;
import com.renlink.entity.User;
import com.renlink.repository.UserRepository;
import com.renlink.service.FriendshipService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class TypingStatusController {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;

    public TypingStatusController(
        SimpMessagingTemplate messagingTemplate,
        UserRepository userRepository,
        FriendshipService friendshipService
    ) {
        this.messagingTemplate = messagingTemplate;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
    }

    @MessageMapping("/typing-status")
    public void handleTypingStatus(TypingStatusMessage message, Principal principal) {
        if (principal == null || message == null || message.getUsername() == null || message.getUsername().isBlank()) {
            return;
        }

        User sender = userRepository.findByUsername(principal.getName())
            .orElse(null);
        User target = userRepository.findByUsername(message.getUsername())
            .orElse(null);
        if (sender == null || target == null || !friendshipService.areFriends(sender.getId(), target.getId())) {
            return;
        }

        TypingStatusMessage forwardMessage = new TypingStatusMessage(
            sender.getUsername(),
            message.isTyping(),
            message.getContext()
        );

        messagingTemplate.convertAndSendToUser(
            target.getUsername(),
            "/queue/typing-status",
            forwardMessage
        );
    }
}
