package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private Long id;
    private String username;
    private String avatar;
    private Boolean online;
    private LocalDateTime lastSeen;
    private LocalDateTime createdAt;
    private boolean friend;
    private String relationshipStatus;
    private Long pendingRequestId;
}
