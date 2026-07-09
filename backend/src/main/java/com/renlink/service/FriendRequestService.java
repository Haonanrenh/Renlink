package com.renlink.service;

import com.renlink.dto.FriendRequestDTO;
import com.renlink.entity.FriendRequest;
import com.renlink.entity.User;
import com.renlink.repository.FriendRequestRepository;
import com.renlink.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class FriendRequestService {

    private static final String STATUS_PENDING = "pending";
    private static final String STATUS_ACCEPTED = "accepted";
    private static final String STATUS_REJECTED = "rejected";

    private final FriendRequestRepository friendRequestRepository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final SimpMessagingTemplate messagingTemplate;

    public FriendRequestService(
        FriendRequestRepository friendRequestRepository,
        UserRepository userRepository,
        FriendshipService friendshipService,
        SimpMessagingTemplate messagingTemplate
    ) {
        this.friendRequestRepository = friendRequestRepository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public void sendRequest(Long requesterId, String receiverUsername) {
        User requester = userRepository.findById(requesterId)
            .orElseThrow(() -> new RuntimeException("当前用户不存在"));
        User receiver = userRepository.findByUsername(receiverUsername)
            .orElseThrow(() -> new RuntimeException("目标用户不存在: " + receiverUsername));

        if (requester.getId().equals(receiver.getId())) {
            throw new IllegalArgumentException("不能给自己发送好友申请");
        }

        if (friendshipService.areFriends(requester.getId(), receiver.getId())) {
            throw new IllegalStateException("你们已经是好友了");
        }

        if (friendRequestRepository.findFirstByRequesterIdAndReceiverIdAndStatusOrderByCreatedAtDesc(
            requester.getId(),
            receiver.getId(),
            STATUS_PENDING
        ).isPresent()) {
            throw new IllegalStateException("好友申请已发送，等待对方处理");
        }

        if (friendRequestRepository.findFirstByRequesterIdAndReceiverIdAndStatusOrderByCreatedAtDesc(
            receiver.getId(),
            requester.getId(),
            STATUS_PENDING
        ).isPresent()) {
            throw new IllegalStateException("对方已经向你发来好友申请，请直接同意或拒绝");
        }

        FriendRequest friendRequest = new FriendRequest();
        friendRequest.setRequesterId(requester.getId());
        friendRequest.setReceiverId(receiver.getId());
        friendRequest.setStatus(STATUS_PENDING);
        FriendRequest savedRequest = friendRequestRepository.save(friendRequest);

        notifyFriendDataChanged(receiver, "REQUEST_CREATED", requester.getUsername(), savedRequest.getId());
        notifyFriendDataChanged(requester, "REQUEST_CREATED", receiver.getUsername(), savedRequest.getId());
    }

    public Map<Long, Long> getIncomingPendingRequestIds(Long userId) {
        return friendRequestRepository.findByReceiverIdAndStatusOrderByCreatedAtDesc(userId, STATUS_PENDING).stream()
            .collect(Collectors.toMap(
                FriendRequest::getRequesterId,
                FriendRequest::getId,
                (first, second) -> first,
                LinkedHashMap::new
            ));
    }

    public Map<Long, Long> getOutgoingPendingRequestIds(Long userId) {
        return friendRequestRepository.findByRequesterIdAndStatusOrderByCreatedAtDesc(userId, STATUS_PENDING).stream()
            .collect(Collectors.toMap(
                FriendRequest::getReceiverId,
                FriendRequest::getId,
                (first, second) -> first,
                LinkedHashMap::new
            ));
    }

    public List<FriendRequestDTO> getIncomingRequests(Long userId) {
        return toRequestDTOs(
            friendRequestRepository.findByReceiverIdAndStatusOrderByCreatedAtDesc(userId, STATUS_PENDING),
            true
        );
    }

    public List<FriendRequestDTO> getOutgoingRequests(Long userId) {
        return toRequestDTOs(
            friendRequestRepository.findByRequesterIdAndStatusOrderByCreatedAtDesc(userId, STATUS_PENDING),
            false
        );
    }

    @Transactional
    public void acceptRequest(Long currentUserId, Long requestId) {
        FriendRequest friendRequest = friendRequestRepository.findByIdAndReceiverIdAndStatus(
            requestId,
            currentUserId,
            STATUS_PENDING
        ).orElseThrow(() -> new RuntimeException("好友申请不存在或已处理"));

        friendRequest.setStatus(STATUS_ACCEPTED);
        friendRequest.setRespondedAt(LocalDateTime.now());
        friendRequestRepository.save(friendRequest);

        friendshipService.ensureMutualFriendship(friendRequest.getRequesterId(), friendRequest.getReceiverId());

        User requester = userRepository.findById(friendRequest.getRequesterId())
            .orElseThrow(() -> new RuntimeException("申请人不存在"));
        User receiver = userRepository.findById(friendRequest.getReceiverId())
            .orElseThrow(() -> new RuntimeException("接收方不存在"));

        notifyFriendDataChanged(requester, "REQUEST_ACCEPTED", receiver.getUsername(), friendRequest.getId());
        notifyFriendDataChanged(receiver, "REQUEST_ACCEPTED", requester.getUsername(), friendRequest.getId());
    }

    @Transactional
    public void rejectRequest(Long currentUserId, Long requestId) {
        FriendRequest friendRequest = friendRequestRepository.findByIdAndReceiverIdAndStatus(
            requestId,
            currentUserId,
            STATUS_PENDING
        ).orElseThrow(() -> new RuntimeException("好友申请不存在或已处理"));

        friendRequest.setStatus(STATUS_REJECTED);
        friendRequest.setRespondedAt(LocalDateTime.now());
        friendRequestRepository.save(friendRequest);

        User requester = userRepository.findById(friendRequest.getRequesterId())
            .orElseThrow(() -> new RuntimeException("申请人不存在"));
        User receiver = userRepository.findById(friendRequest.getReceiverId())
            .orElseThrow(() -> new RuntimeException("接收方不存在"));

        notifyFriendDataChanged(requester, "REQUEST_REJECTED", receiver.getUsername(), friendRequest.getId());
        notifyFriendDataChanged(receiver, "REQUEST_REJECTED", requester.getUsername(), friendRequest.getId());
    }

    private List<FriendRequestDTO> toRequestDTOs(List<FriendRequest> requests, boolean incoming) {
        if (requests.isEmpty()) {
            return List.of();
        }

        List<Long> userIds = requests.stream()
            .map(request -> incoming ? request.getRequesterId() : request.getReceiverId())
            .distinct()
            .toList();

        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
            .collect(Collectors.toMap(User::getId, Function.identity()));

        return requests.stream()
            .map(request -> {
                Long userId = incoming ? request.getRequesterId() : request.getReceiverId();
                User user = userMap.get(userId);
                if (user == null) {
                    return null;
                }

                return new FriendRequestDTO(
                    request.getId(),
                    user.getId(),
                    user.getUsername(),
                    user.getAvatar(),
                    user.getOnline(),
                    user.getLastSeen(),
                    request.getCreatedAt(),
                    request.getStatus(),
                    incoming ? "incoming" : "outgoing"
                );
            })
            .filter(dto -> dto != null)
            .toList();
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
