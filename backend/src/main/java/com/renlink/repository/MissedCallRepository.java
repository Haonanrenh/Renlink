package com.renlink.repository;

import com.renlink.entity.MissedCall;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MissedCallRepository extends JpaRepository<MissedCall, Long> {
    
    // 查询用户的所有未接来电（按时间倒序）
    List<MissedCall> findByUserIdOrderByMissedAtDesc(Long userId);
    
    // 查询用户的未读未接来电
    List<MissedCall> findByUserIdAndIsReadFalseOrderByMissedAtDesc(Long userId);
    
    // 统计用户的未读未接来电数量
    long countByUserIdAndIsReadFalse(Long userId);
}
