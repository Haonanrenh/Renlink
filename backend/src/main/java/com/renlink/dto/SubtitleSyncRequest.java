package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SubtitleSyncRequest {
    private String targetUsername;
    private String channelName;
    private String text;
    private boolean finalSegment;
}
