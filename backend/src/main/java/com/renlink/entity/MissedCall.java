package com.renlink.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "missed_calls")
public class MissedCall {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private Long userId;  // 未接来电的用户
    
    @Column(nullable = false)
    private Long callerId;  // 呼叫者
    
    @Column(nullable = false)
    private String callerName;  // 呼叫者用户名
    
    @Column(nullable = false)
    private String callType;  // video 或 audio
    
    @Column(nullable = false)
    private LocalDateTime missedAt;  // 未接时间
    
    @Column(nullable = false)
    private Boolean isRead = false;  // 是否已读
    
    // Getters and Setters
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public Long getUserId() {
        return userId;
    }
    
    public void setUserId(Long userId) {
        this.userId = userId;
    }
    
    public Long getCallerId() {
        return callerId;
    }
    
    public void setCallerId(Long callerId) {
        this.callerId = callerId;
    }
    
    public String getCallerName() {
        return callerName;
    }
    
    public void setCallerName(String callerName) {
        this.callerName = callerName;
    }
    
    public String getCallType() {
        return callType;
    }
    
    public void setCallType(String callType) {
        this.callType = callType;
    }
    
    public LocalDateTime getMissedAt() {
        return missedAt;
    }
    
    public void setMissedAt(LocalDateTime missedAt) {
        this.missedAt = missedAt;
    }
    
    public Boolean getIsRead() {
        return isRead;
    }
    
    public void setIsRead(Boolean isRead) {
        this.isRead = isRead;
    }
}
