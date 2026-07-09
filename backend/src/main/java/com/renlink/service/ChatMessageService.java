package com.renlink.service;

import com.renlink.dto.ChatMessageDTO;
import com.renlink.dto.ChatMessageRequest;
import com.renlink.entity.ChatMessage;
import com.renlink.entity.User;
import com.renlink.repository.ChatMessageRepository;
import com.renlink.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ChatMessageService {

    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatMessageService(
        ChatMessageRepository chatMessageRepository,
        UserRepository userRepository,
        FriendshipService friendshipService,
        SimpMessagingTemplate messagingTemplate
    ) {
        this.chatMessageRepository = chatMessageRepository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public ChatMessageDTO sendMessage(Long senderId, ChatMessageRequest request) {
        User sender = userRepository.findById(senderId)
            .orElseThrow(() -> new RuntimeException("发送方不存在"));
        User receiver = userRepository.findByUsername(request.getReceiverUsername())
            .orElseThrow(() -> new RuntimeException("接收方不存在: " + request.getReceiverUsername()));

        validateCanChat(sender.getId(), receiver.getId());

        String content = request.getContent().trim();
        if (content.isEmpty()) {
            throw new IllegalArgumentException("消息内容不能为空");
        }

        ChatMessage chatMessage = new ChatMessage();
        chatMessage.setSenderId(sender.getId());
        chatMessage.setReceiverId(receiver.getId());
        chatMessage.setContent(content);
        chatMessage.setIsRead(false);

        ChatMessage savedMessage = chatMessageRepository.save(chatMessage);

        ChatMessageDTO receiverMessage = toDTO(savedMessage, sender, receiver, false);
        messagingTemplate.convertAndSendToUser(
            receiver.getUsername(),
            "/queue/direct-messages",
            receiverMessage
        );

        return toDTO(savedMessage, sender, receiver, true);
    }

    @Transactional
    public List<ChatMessageDTO> getConversation(Long currentUserId, String friendUsername) {
        User currentUser = userRepository.findById(currentUserId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));
        User friend = userRepository.findByUsername(friendUsername)
            .orElseThrow(() -> new RuntimeException("好友不存在: " + friendUsername));

        validateCanChat(currentUser.getId(), friend.getId());
        markMessagesAsRead(friend.getId(), currentUser.getId());

        return chatMessageRepository
            .findBySenderIdAndReceiverIdOrSenderIdAndReceiverIdOrderByCreatedAtAsc(
                currentUser.getId(),
                friend.getId(),
                friend.getId(),
                currentUser.getId()
            )
            .stream()
            .map(message -> {
                boolean mine = message.getSenderId().equals(currentUser.getId());
                return toDTO(message, mine ? currentUser : friend, mine ? friend : currentUser, mine);
            })
            .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getUnreadSummary(Long currentUserId) {
        User currentUser = userRepository.findById(currentUserId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));

        Map<Long, User> friendMap = userRepository.findAllById(friendshipService.getFriendIds(currentUser.getId())).stream()
            .collect(Collectors.toMap(User::getId, Function.identity()));

        Map<String, Long> unreadCounts = new LinkedHashMap<>();
        long totalUnreadCount = 0L;

        for (ChatMessageRepository.UnreadMessageCountView item
                : chatMessageRepository.findUnreadCountsBySenderId(currentUser.getId())) {
            User sender = friendMap.get(item.getSenderId());
            if (sender == null) {
                continue;
            }

            unreadCounts.put(sender.getUsername(), item.getUnreadCount());
            totalUnreadCount += item.getUnreadCount();
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalUnreadCount", totalUnreadCount);
        summary.put("unreadCounts", unreadCounts);
        return summary;
    }

    @Transactional
    public long markConversationAsRead(Long currentUserId, String friendUsername) {
        User currentUser = userRepository.findById(currentUserId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));
        User friend = userRepository.findByUsername(friendUsername)
            .orElseThrow(() -> new RuntimeException("好友不存在: " + friendUsername));

        validateCanChat(currentUser.getId(), friend.getId());
        return markMessagesAsRead(friend.getId(), currentUser.getId());
    }

    private long markMessagesAsRead(Long senderId, Long receiverId) {
        List<ChatMessage> unreadMessages = chatMessageRepository
            .findBySenderIdAndReceiverIdAndIsReadFalseOrderByCreatedAtAsc(senderId, receiverId);
        if (unreadMessages.isEmpty()) {
            return 0L;
        }

        unreadMessages.forEach(message -> {
            message.setIsRead(true);
            message.setReadAt(LocalDateTime.now());
        });
        chatMessageRepository.saveAll(unreadMessages);
        return unreadMessages.size();
    }

    private void validateCanChat(Long currentUserId, Long friendId) {
        if (currentUserId.equals(friendId)) {
            throw new IllegalArgumentException("不能给自己发送消息");
        }

        if (!friendshipService.areFriends(currentUserId, friendId)) {
            throw new IllegalStateException("只有好友之间才能发送消息");
        }
    }

    private ChatMessageDTO toDTO(ChatMessage message, User sender, User receiver, boolean mine) {
        return new ChatMessageDTO(
            message.getId(),
            sender.getId(),
            sender.getUsername(),
            receiver.getId(),
            receiver.getUsername(),
            message.getContent(),
            message.getCreatedAt(),
            mine,
            Boolean.TRUE.equals(message.getIsRead())
        );
    }
}
