package com.renlink.controller;

import com.renlink.dto.FriendRequestDTO;
import com.renlink.dto.FriendshipRequest;
import com.renlink.dto.UserDTO;
import com.renlink.entity.User;
import com.renlink.mapper.UserMapper;
import com.renlink.repository.UserRepository;
import com.renlink.service.CurrentUserService;
import com.renlink.service.FriendRequestService;
import com.renlink.service.FriendshipService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final CurrentUserService currentUserService;
    private final FriendshipService friendshipService;
    private final FriendRequestService friendRequestService;

    public UserController(
        UserRepository userRepository,
        CurrentUserService currentUserService,
        FriendshipService friendshipService,
        FriendRequestService friendRequestService
    ) {
        this.userRepository = userRepository;
        this.currentUserService = currentUserService;
        this.friendshipService = friendshipService;
        this.friendRequestService = friendRequestService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<UserDTO>> searchUsers(
        @RequestParam String query,
        Authentication authentication
    ) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        Set<Long> friendIds = friendshipService.getFriendIds(currentUser.getId());
        Map<Long, Long> incomingRequestIds = friendRequestService.getIncomingPendingRequestIds(currentUser.getId());
        Map<Long, Long> outgoingRequestIds = friendRequestService.getOutgoingPendingRequestIds(currentUser.getId());

        String normalizedQuery = query == null ? "" : query.toLowerCase();
        List<UserDTO> userDTOs = userRepository.findAll().stream()
            .filter(user -> user.getUsername().toLowerCase().contains(normalizedQuery))
            .filter(user -> !user.getUsername().equals(currentUser.getUsername()))
            .limit(20)
            .map(user -> {
                UserDTO dto = UserMapper.toDTO(user);
                applyRelationshipMetadata(dto, user, friendIds, incomingRequestIds, outgoingRequestIds);
                return dto;
            })
            .collect(Collectors.toList());

        return ResponseEntity.ok(userDTOs);
    }

    @GetMapping("/friends")
    public ResponseEntity<List<UserDTO>> getFriends(Authentication authentication) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        return ResponseEntity.ok(friendshipService.getFriends(currentUser.getId()));
    }

    @PostMapping("/friends")
    public ResponseEntity<Map<String, Object>> addFriend(
        Authentication authentication,
        @RequestBody @Valid FriendshipRequest request
    ) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        friendRequestService.sendRequest(currentUser.getId(), request.getFriendUsername());
        return ResponseEntity.ok(success("好友申请已发送"));
    }

    @DeleteMapping("/friends/{friendUsername}")
    public ResponseEntity<Map<String, Object>> removeFriend(
        @PathVariable String friendUsername,
        Authentication authentication
    ) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        friendshipService.removeFriend(currentUser.getId(), friendUsername);
        return ResponseEntity.ok(success("好友已删除"));
    }

    @GetMapping("/friends/requests/incoming")
    public ResponseEntity<List<FriendRequestDTO>> getIncomingFriendRequests(Authentication authentication) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        return ResponseEntity.ok(friendRequestService.getIncomingRequests(currentUser.getId()));
    }

    @GetMapping("/friends/requests/outgoing")
    public ResponseEntity<List<FriendRequestDTO>> getOutgoingFriendRequests(Authentication authentication) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        return ResponseEntity.ok(friendRequestService.getOutgoingRequests(currentUser.getId()));
    }

    @PostMapping("/friends/requests/{id}/accept")
    public ResponseEntity<Map<String, Object>> acceptFriendRequest(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        friendRequestService.acceptRequest(currentUser.getId(), id);
        return ResponseEntity.ok(success("好友申请已同意"));
    }

    @PostMapping("/friends/requests/{id}/reject")
    public ResponseEntity<Map<String, Object>> rejectFriendRequest(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = currentUserService.requireCurrentUser(authentication);
        friendRequestService.rejectRequest(currentUser.getId(), id);
        return ResponseEntity.ok(success("好友申请已拒绝"));
    }

    private Map<String, Object> success(String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", message);
        return response;
    }

    private void applyRelationshipMetadata(
        UserDTO dto,
        User user,
        Set<Long> friendIds,
        Map<Long, Long> incomingRequestIds,
        Map<Long, Long> outgoingRequestIds
    ) {
        if (friendIds.contains(user.getId())) {
            dto.setFriend(true);
            dto.setRelationshipStatus("FRIEND");
            return;
        }

        Long incomingRequestId = incomingRequestIds.get(user.getId());
        if (incomingRequestId != null) {
            dto.setRelationshipStatus("INCOMING_REQUEST");
            dto.setPendingRequestId(incomingRequestId);
            return;
        }

        Long outgoingRequestId = outgoingRequestIds.get(user.getId());
        if (outgoingRequestId != null) {
            dto.setRelationshipStatus("OUTGOING_REQUEST");
            dto.setPendingRequestId(outgoingRequestId);
            return;
        }

        dto.setRelationshipStatus("NONE");
    }
}
