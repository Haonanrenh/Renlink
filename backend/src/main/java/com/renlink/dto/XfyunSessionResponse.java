package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class XfyunSessionResponse {
    private boolean success;
    private String provider;
    private String wsUrl;
    private String lang;
    private String audioEncode;
    private int sampleRate;
    private int frameBytes;
    private int frameIntervalMs;
    private String message;
}
