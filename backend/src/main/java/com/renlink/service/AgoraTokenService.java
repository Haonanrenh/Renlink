package com.renlink.service;

import io.agora.media.RtcTokenBuilder2;
import io.agora.media.RtcTokenBuilder2.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AgoraTokenService {
    
    @Value("${agora.app-id}")
    private String appId;
    
    @Value("${agora.app-certificate}")
    private String appCertificate;
    
    @Value("${agora.token-expiration:3600}")
    private int tokenExpiration;
    
    /**
     * 生成 RTC Token（使用官方 RtcTokenBuilder2）
     * @param channelName 频道名称
     * @param uid 用户 ID（0 表示任意用户）
     * @return Token 字符串
     */
    public String generateRtcToken(String channelName, int uid) {
        try {
            if (appId == null || appId.trim().isEmpty()) {
                throw new RuntimeException("App ID 未配置");
            }
            if (appCertificate == null || appCertificate.trim().isEmpty()) {
                throw new RuntimeException("App Certificate 未配置");
            }
            
            RtcTokenBuilder2 tokenBuilder = new RtcTokenBuilder2();
            
            String token = tokenBuilder.buildTokenWithUid(
                appId,
                appCertificate,
                channelName,
                uid,
                Role.ROLE_PUBLISHER,
                tokenExpiration,
                tokenExpiration
            );

            return token;
        } catch (Exception e) {
            throw new RuntimeException("生成 Agora Token 失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 生成 RTC Token（使用字符串 UID）
     * @param channelName 频道名称
     * @param userAccount 用户账号
     * @return Token 字符串
     */
    public String generateRtcTokenWithAccount(String channelName, String userAccount) {
        try {
            // 检查配置
            if (appId == null || appId.trim().isEmpty()) {
                throw new RuntimeException("App ID 未配置");
            }
            if (appCertificate == null || appCertificate.trim().isEmpty()) {
                throw new RuntimeException("App Certificate 未配置");
            }
            
            // 创建 RtcTokenBuilder2 实例
            RtcTokenBuilder2 tokenBuilder = new RtcTokenBuilder2();
            
            // 使用官方 buildTokenWithUserAccount 方法
            String token = tokenBuilder.buildTokenWithUserAccount(
                appId,
                appCertificate,
                channelName,
                userAccount,
                Role.ROLE_PUBLISHER,
                tokenExpiration,
                tokenExpiration
            );
            
            return token;
        } catch (Exception e) {
            throw new RuntimeException("生成 Agora Token 失败: " + e.getMessage(), e);
        }
    }
}
