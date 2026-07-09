package com.renlink.controller;

import com.renlink.dto.CallInvitationRequest;
import com.renlink.entity.CallInvitation;
import com.renlink.entity.MissedCall;
import com.renlink.entity.User;
import com.renlink.repository.UserRepository;
import com.renlink.service.CallInvitationService;
import com.renlink.service.CurrentUserService;
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
@RequestMapping("/api/call-invitations")
public class CallInvitationController {

    private final CallInvitationService callInvitationService;
    private final UserRepository userRepository;
    private final CurrentUserService currentUserService;

    public CallInvitationController(
        CallInvitationService callInvitationService,
        UserRepository userRepository,
        CurrentUserService currentUserService
    ) {
        this.callInvitationService = callInvitationService;
        this.userRepository = userRepository;
        this.currentUserService = currentUserService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createInvitation(
        @RequestBody CallInvitationRequest request,
        Authentication authentication
    ) {
        try {
            User currentUser = resolveCurrentUser(authentication);
            Long calleeId = resolveCalleeId(request);
            if (currentUser.getId().equals(calleeId)) {
                return badRequest("不能呼叫自己");
            }

            CallInvitation invitation = callInvitationService.createInvitation(
                currentUser.getId(),
                calleeId,
                request.getChannelName(),
                request.getCallType()
            );

            return ResponseEntity.ok(success("invitation", invitation));
        } catch (RuntimeException ex) {
            return badRequest(ex.getMessage());
        }
    }

    @GetMapping("/pending")
    public ResponseEntity<List<CallInvitation>> getPendingInvitations(Authentication authentication) {
        User currentUser = resolveCurrentUser(authentication);
        return ResponseEntity.ok(callInvitationService.getPendingInvitations(currentUser.getId()));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<Map<String, Object>> acceptInvitation(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        CallInvitation invitation = callInvitationService.acceptInvitation(id, currentUser.getId());
        return ResponseEntity.ok(success("invitation", invitation));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Map<String, Object>> rejectInvitation(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        CallInvitation invitation = callInvitationService.rejectInvitation(id, currentUser.getId());
        return ResponseEntity.ok(success("invitation", invitation));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Map<String, Object>> cancelInvitation(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        callInvitationService.cancelInvitation(id, currentUser.getId());

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "邀请已取消");
        return ResponseEntity.ok(response);
    }

    @GetMapping("/missed-calls")
    public ResponseEntity<List<MissedCall>> getMissedCalls(Authentication authentication) {
        User currentUser = resolveCurrentUser(authentication);
        return ResponseEntity.ok(callInvitationService.getMissedCalls(currentUser.getId()));
    }

    @GetMapping("/missed-calls/unread-count")
    public ResponseEntity<Map<String, Object>> getUnreadMissedCallCount(Authentication authentication) {
        User currentUser = resolveCurrentUser(authentication);
        return ResponseEntity.ok(Map.of("count", callInvitationService.getUnreadMissedCallCount(currentUser.getId())));
    }

    @PostMapping("/missed-calls/{id}/mark-read")
    public ResponseEntity<Map<String, Object>> markMissedCallAsRead(
        @PathVariable Long id,
        Authentication authentication
    ) {
        User currentUser = resolveCurrentUser(authentication);
        callInvitationService.markMissedCallAsRead(id, currentUser.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/missed-calls/mark-all-read")
    public ResponseEntity<Map<String, Object>> markAllMissedCallsAsRead(Authentication authentication) {
        User currentUser = resolveCurrentUser(authentication);
        callInvitationService.markAllMissedCallsAsRead(currentUser.getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    private User resolveCurrentUser(Authentication authentication) {
        return currentUserService.requireCurrentUser(authentication);
    }

    private Long resolveCalleeId(CallInvitationRequest request) {
        if (request.getCalleeUsername() != null && !request.getCalleeUsername().isBlank()) {
            return userRepository.findByUsername(request.getCalleeUsername())
                .orElseThrow(() -> new RuntimeException("接收者不存在: " + request.getCalleeUsername()))
                .getId();
        }
        if (request.getCalleeId() != null) {
            return request.getCalleeId();
        }
        throw new RuntimeException("必须提供接收者用户名或 ID");
    }

    private Map<String, Object> success(String key, Object value) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put(key, value);
        return response;
    }

    private ResponseEntity<Map<String, Object>> badRequest(String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", false);
        response.put("message", message);
        return ResponseEntity.badRequest().body(response);
    }
}
