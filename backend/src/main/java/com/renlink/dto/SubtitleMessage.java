package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SubtitleMessage {
    private String senderUsername;
    private String targetUsername;
    private String channelName;
    private String text;
    private boolean finalSegment;
    private LocalDateTime sentAt;
}
