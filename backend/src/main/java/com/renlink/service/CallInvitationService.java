package com.renlink.service;

import com.renlink.entity.CallInvitation;
import com.renlink.entity.MissedCall;
import com.renlink.entity.User;
import com.renlink.repository.CallInvitationRepository;
import com.renlink.repository.MissedCallRepository;
import com.renlink.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CallInvitationService {
    
    @Autowired
    private CallInvitationRepository callInvitationRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private MissedCallRepository missedCallRepository;
    
    @Autowired
    private SimpMessagingTemplate messagingTemplate;
    
    @Autowired
    private FriendshipService friendshipService;
    
    /**
     * 创建呼叫邀请并通过 WebSocket 推送
     */
    @Transactional
    public CallInvitation createInvitation(Long callerId, Long calleeId, String channelName, String callType) {
        // 验证用户存在
        User caller = userRepository.findById(callerId)
            .orElseThrow(() -> new RuntimeException("发起者不存在"));
        User callee = userRepository.findById(calleeId)
            .orElseThrow(() -> new RuntimeException("接收者不存在"));
        
        // 创建邀请
        if (callerId.equals(calleeId)) {
            throw new IllegalArgumentException("不能呼叫自己");
        }

        if (!friendshipService.areFriends(callerId, calleeId)) {
            throw new IllegalArgumentException("只有好友之间才能发起语音或视频通话");
        }

        CallInvitation invitation = new CallInvitation();
        invitation.setCallerId(callerId);
        invitation.setCallerName(caller.getUsername());
        invitation.setCalleeId(calleeId);
        invitation.setChannelName(channelName);
        invitation.setCallType(callType);
        invitation.setStatus("pending");
        
        CallInvitation savedInvitation = callInvitationRepository.save(invitation);
        
        messagingTemplate.convertAndSendToUser(
            callee.getUsername(),
            "/queue/call-invitations",
            savedInvitation
        );
        
        return savedInvitation;
    }
    
    /**
     * 获取用户的待处理邀请
     */
    public List<CallInvitation> getPendingInvitations(Long userId) {
        return callInvitationRepository.findByCalleeIdAndStatus(userId, "pending");
    }
    
    /**
     * 接受邀请
     */
    @Transactional
    public CallInvitation acceptInvitation(Long invitationId, Long userId) {
        CallInvitation invitation = callInvitationRepository.findByIdAndCalleeId(invitationId, userId)
            .orElseThrow(() -> new RuntimeException("邀请不存在或无权限"));
        
        if (!"pending".equals(invitation.getStatus())) {
            throw new RuntimeException("邀请已处理");
        }
        
        invitation.setStatus("accepted");
        invitation.setRespondedAt(LocalDateTime.now());
        
        return callInvitationRepository.save(invitation);
    }
    
    /**
     * 拒绝邀请（不记录为未接来电）
     */
    @Transactional
    public CallInvitation rejectInvitation(Long invitationId, Long userId) {
        CallInvitation invitation = callInvitationRepository.findByIdAndCalleeId(invitationId, userId)
            .orElseThrow(() -> new RuntimeException("邀请不存在或无权限"));
        
        if (!"pending".equals(invitation.getStatus())) {
            throw new RuntimeException("邀请已处理");
        }
        
        invitation.setStatus("rejected");
        invitation.setRespondedAt(LocalDateTime.now());
        
        CallInvitation savedInvitation = callInvitationRepository.save(invitation);
        
        // 通过 WebSocket 通知发起者被拒绝
        User caller = userRepository.findById(invitation.getCallerId())
            .orElse(null);
        
        if (caller != null) {
            messagingTemplate.convertAndSendToUser(
                caller.getUsername(),
                "/queue/call-rejected",
                savedInvitation
            );
        }
        
        return savedInvitation;
    }
    
    /**
     * 取消邀请（发起者取消）- 记录为未接来电并通知接收方
     */
    @Transactional
    public void cancelInvitation(Long invitationId, Long callerId) {
        CallInvitation invitation = callInvitationRepository.findById(invitationId)
            .orElseThrow(() -> new RuntimeException("邀请不存在"));
        
        if (!invitation.getCallerId().equals(callerId)) {
            throw new RuntimeException("无权限取消此邀请");
        }
        
        if (!"pending".equals(invitation.getStatus())) {
            throw new RuntimeException("邀请已处理");
        }
        
        invitation.setStatus("cancelled");
        invitation.setRespondedAt(LocalDateTime.now());
        callInvitationRepository.save(invitation);
        
        // 发起方取消时，记录为未接来电（对方未接听）
        recordMissedCall(invitation);
        
        // 通过 WebSocket 通知接收方关闭来电提醒
        User callee = userRepository.findById(invitation.getCalleeId())
            .orElse(null);
        
        if (callee != null) {
            messagingTemplate.convertAndSendToUser(
                callee.getUsername(),
                "/queue/call-cancelled",
                invitation
            );
        }
    }
    
    /**
     * 定时清理过期的邀请（每分钟执行一次）
     * 超过 60 秒未响应的邀请自动标记为过期，并记录为未接来电
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void cleanupExpiredInvitations() {
        LocalDateTime expiryTime = LocalDateTime.now().minusSeconds(60);
        List<CallInvitation> expiredInvitations = callInvitationRepository
            .findByStatusAndCreatedAtBefore("pending", expiryTime);
        
        for (CallInvitation invitation : expiredInvitations) {
            invitation.setStatus("expired");
            invitation.setRespondedAt(LocalDateTime.now());
            callInvitationRepository.save(invitation);
            
            // 记录为未接来电
            recordMissedCall(invitation);
        }
    }
    
    /**
     * 记录未接来电（只保留最近10条）
     */
    private void recordMissedCall(CallInvitation invitation) {
        MissedCall missedCall = new MissedCall();
        missedCall.setUserId(invitation.getCalleeId());
        missedCall.setCallerId(invitation.getCallerId());
        missedCall.setCallerName(invitation.getCallerName());
        missedCall.setCallType(invitation.getCallType());
        missedCall.setMissedAt(LocalDateTime.now());
        missedCall.setIsRead(false);
        
        missedCallRepository.save(missedCall);
        
        // 只保留最近10条未接来电
        List<MissedCall> allMissedCalls = missedCallRepository.findByUserIdOrderByMissedAtDesc(invitation.getCalleeId());
        if (allMissedCalls.size() > 10) {
            // 删除超过10条的旧记录
            List<MissedCall> toDelete = allMissedCalls.subList(10, allMissedCalls.size());
            missedCallRepository.deleteAll(toDelete);
        }
    }
    
    /**
     * 获取用户的未接来电列表
     */
    public List<MissedCall> getMissedCalls(Long userId) {
        return missedCallRepository.findByUserIdOrderByMissedAtDesc(userId);
    }
    
    /**
     * 获取用户的未读未接来电数量
     */
    public long getUnreadMissedCallCount(Long userId) {
        return missedCallRepository.countByUserIdAndIsReadFalse(userId);
    }
    
    /**
     * 标记未接来电为已读
     */
    @Transactional
    public void markMissedCallAsRead(Long missedCallId, Long userId) {
        MissedCall missedCall = missedCallRepository.findById(missedCallId)
            .orElseThrow(() -> new RuntimeException("未接来电不存在"));
        
        if (!missedCall.getUserId().equals(userId)) {
            throw new RuntimeException("无权限操作此记录");
        }
        
        missedCall.setIsRead(true);
        missedCallRepository.save(missedCall);
    }
    
    /**
     * 标记所有未接来电为已读
     */
    @Transactional
    public void markAllMissedCallsAsRead(Long userId) {
        List<MissedCall> missedCalls = missedCallRepository.findByUserIdAndIsReadFalseOrderByMissedAtDesc(userId);
        for (MissedCall missedCall : missedCalls) {
            missedCall.setIsRead(true);
            missedCallRepository.save(missedCall);
        }
    }
}
