package com.renlink.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "call_invitations")
@Data
public class CallInvitation {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private Long callerId;  // 发起者 ID
    
    @Column(nullable = false)
    private String callerName;  // 发起者名称
    
    @Column(nullable = false)
    private Long calleeId;  // 接收者 ID
    
    @Column(nullable = false)
    private String channelName;  // Agora 频道名
    
    @Column(nullable = false)
    private String callType;  // video 或 audio
    
    @Column(nullable = false)
    private String status;  // pending, accepted, rejected, cancelled, expired
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    private LocalDateTime respondedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) {
            status = "pending";
        }
    }
}
