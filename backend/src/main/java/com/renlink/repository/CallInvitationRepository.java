package com.renlink.repository;

import com.renlink.entity.CallInvitation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CallInvitationRepository extends JpaRepository<CallInvitation, Long> {
    
    // 查找用户的待处理呼叫邀请
    List<CallInvitation> findByCalleeIdAndStatus(Long calleeId, String status);
    
    // 查找特定的呼叫邀请
    Optional<CallInvitation> findByIdAndCalleeId(Long id, Long calleeId);
    
    // 查找过期的邀请
    List<CallInvitation> findByStatusAndCreatedAtBefore(String status, LocalDateTime time);
}
