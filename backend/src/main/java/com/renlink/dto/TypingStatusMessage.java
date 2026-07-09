package com.renlink.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 正在输入状态消息
 */
public class TypingStatusMessage {
    private String username;
    
    @JsonProperty("isTyping")
    private boolean isTyping;
    
    private String context; // "tts" 或 "chat"

    public TypingStatusMessage() {
    }

    public TypingStatusMessage(String username, boolean isTyping, String context) {
        this.username = username;
        this.isTyping = isTyping;
        this.context = context;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    @JsonProperty("isTyping")
    public boolean isTyping() {
        return isTyping;
    }

    @JsonProperty("isTyping")
    public void setTyping(boolean typing) {
        isTyping = typing;
    }

    public String getContext() {
        return context;
    }

    public void setContext(String context) {
        this.context = context;
    }
}
