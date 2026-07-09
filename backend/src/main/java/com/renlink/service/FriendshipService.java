package com.renlink.service;

import com.renlink.dto.UserDTO;
import com.renlink.entity.Friendship;
import com.renlink.entity.User;
import com.renlink.mapper.UserMapper;
import com.renlink.repository.FriendshipRepository;
import com.renlink.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public FriendshipService(
        FriendshipRepository friendshipRepository,
        UserRepository userRepository,
        SimpMessagingTemplate messagingTemplate
    ) {
        this.friendshipRepository = friendshipRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public List<UserDTO> getFriends(Long userId) {
        List<Friendship> friendships = friendshipRepository.findByUserId(userId);
        if (friendships.isEmpty()) {
            return List.of();
        }

        List<Long> friendIds = friendships.stream()
            .map(Friendship::getFriendId)
            .distinct()
            .toList();

        Map<Long, User> userMap = userRepository.findAllById(friendIds).stream()
            .collect(Collectors.toMap(User::getId, Function.identity()));

        return friendIds.stream()
            .map(userMap::get)
            .filter(friend -> friend != null)
            .sorted(
                Comparator.comparing(
                    (User friend) -> Boolean.TRUE.equals(friend.getOnline())
                ).reversed().thenComparing(User::getUsername, String.CASE_INSENSITIVE_ORDER)
            )
            .map(friend -> {
                UserDTO dto = UserMapper.toDTO(friend);
                dto.setFriend(true);
                dto.setRelationshipStatus("FRIEND");
                return dto;
            })
            .toList();
    }

    public Set<Long> getFriendIds(Long userId) {
        return friendshipRepository.findByUserId(userId).stream()
            .map(Friendship::getFriendId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public boolean areFriends(Long userId, Long friendId) {
        return friendshipRepository.existsByUserIdAndFriendId(userId, friendId);
    }

    @Transactional
    public void addFriend(Long userId, String friendUsername) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));

        User friend = userRepository.findByUsername(friendUsername)
            .orElseThrow(() -> new RuntimeException("好友用户不存在: " + friendUsername));

        ensureMutualFriendship(user.getId(), friend.getId());
    }

    @Transactional
    public void ensureMutualFriendship(Long userId, Long friendId) {
        if (userId == null || friendId == null) {
            throw new IllegalArgumentException("好友关系用户 ID 不能为空");
        }

        if (userId.equals(friendId)) {
            throw new IllegalArgumentException("不能把自己添加为好友");
        }

        userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("用户不存在: " + userId));
        userRepository.findById(friendId)
            .orElseThrow(() -> new RuntimeException("好友不存在: " + friendId));

        createOneWayFriendship(userId, friendId);
        createOneWayFriendship(friendId, userId);
    }

    @Transactional
    public void removeFriend(Long userId, String friendUsername) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));
        User friend = userRepository.findByUsername(friendUsername)
            .orElseThrow(() -> new RuntimeException("好友用户不存在: " + friendUsername));

        if (!friendshipRepository.existsByUserIdAndFriendId(user.getId(), friend.getId())) {
            throw new IllegalStateException("对方当前并不是你的好友");
        }

        friendshipRepository.deleteByUserIdAndFriendId(user.getId(), friend.getId());
        friendshipRepository.deleteByUserIdAndFriendId(friend.getId(), user.getId());

        notifyFriendDataChanged(user, "FRIEND_REMOVED", friend.getUsername(), null);
        notifyFriendDataChanged(friend, "FRIEND_REMOVED", user.getUsername(), null);
    }

    private void createOneWayFriendship(Long userId, Long friendId) {
        if (friendshipRepository.existsByUserIdAndFriendId(userId, friendId)) {
            return;
        }

        Friendship friendship = new Friendship();
        friendship.setUserId(userId);
        friendship.setFriendId(friendId);
        friendshipRepository.save(friendship);
    }

    private void notifyFriendDataChanged(User targetUser, String eventType, String counterpartUsername, Long requestId) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", eventType);
        payload.put("counterpartUsername", counterpartUsername);
        payload.put("requestId", requestId);

        messagingTemplate.convertAndSendToUser(
            targetUser.getUsername(),
            "/queue/friend-updates",
            payload
        );
    }
}
