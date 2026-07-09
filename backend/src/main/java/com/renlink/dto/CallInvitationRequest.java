package com.renlink.dto;

import lombok.Data;

@Data
public class CallInvitationRequest {
    private Long calleeId;           // 接收者 ID（可选）
    private String calleeUsername;   // 接收者用户名（可选）
    private String channelName;
    private String callType;
}
