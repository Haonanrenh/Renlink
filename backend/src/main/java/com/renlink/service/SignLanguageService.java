package com.renlink.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 手语数字人服务
 */
@Service
public class SignLanguageService {

    @Value("${sign-language.app-secret:}")
    private String appSecret;

    @Value("${sign-language.enabled:false}")
    private boolean enabled;

    /**
     * 检查功能是否启用
     * @return true if enabled
     */
    public boolean isEnabled() {
        return enabled && appSecret != null && !appSecret.isEmpty();
    }
}
