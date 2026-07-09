package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FriendRequestDTO {
    private Long requestId;
    private Long userId;
    private String username;
    private String avatar;
    private Boolean online;
    private LocalDateTime lastSeen;
    private LocalDateTime createdAt;
    private String status;
    private String direction;
}
