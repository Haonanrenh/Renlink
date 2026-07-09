package com.renlink.config;

import com.renlink.service.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    @Autowired
    private JwtService jwtService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            // 从 header 中获取 token
            String authHeader = accessor.getFirstNativeHeader("Authorization");
            
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new IllegalArgumentException("WebSocket CONNECT requires a Bearer token");
            }

            String token = authHeader.substring(7);

            try {
                String username = jwtService.validateAndExtractUsername(token);
                Principal principal = () -> username;
                accessor.setUser(principal);
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid WebSocket token", e);
            }
        }
        
        return message;
    }
}
