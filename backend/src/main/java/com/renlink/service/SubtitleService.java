package com.renlink.service;

import com.renlink.dto.SubtitleMessage;
import com.renlink.dto.SubtitleSyncRequest;
import com.renlink.entity.User;
import com.renlink.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Service
public class SubtitleService {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;

    public SubtitleService(
        SimpMessagingTemplate messagingTemplate,
        UserRepository userRepository,
        FriendshipService friendshipService
    ) {
        this.messagingTemplate = messagingTemplate;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
    }

    public void shareSubtitle(String senderUsername, SubtitleSyncRequest request) {
        if (!StringUtils.hasText(senderUsername)) {
            throw new IllegalArgumentException("发送者不能为空");
        }

        if (request == null) {
            throw new IllegalArgumentException("字幕请求不能为空");
        }

        if (!StringUtils.hasText(request.getTargetUsername())) {
            throw new IllegalArgumentException("目标用户不能为空");
        }

        if (!StringUtils.hasText(request.getChannelName())) {
            throw new IllegalArgumentException("频道名称不能为空");
        }

        if (!StringUtils.hasText(request.getText())) {
            throw new IllegalArgumentException("字幕内容不能为空");
        }

        User sender = userRepository.findByUsername(senderUsername)
            .orElseThrow(() -> new IllegalArgumentException("发送者不存在"));
        User target = userRepository.findByUsername(request.getTargetUsername())
            .orElseThrow(() -> new IllegalArgumentException("目标用户不存在"));
        if (!friendshipService.areFriends(sender.getId(), target.getId())) {
            throw new IllegalStateException("只有好友之间才能同步字幕");
        }

        SubtitleMessage message = new SubtitleMessage(
            sender.getUsername(),
            target.getUsername(),
            request.getChannelName(),
            request.getText(),
            request.isFinalSegment(),
            LocalDateTime.now()
        );

        messagingTemplate.convertAndSendToUser(
            target.getUsername(),
            "/queue/subtitles",
            message
        );
    }
}
