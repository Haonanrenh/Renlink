package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 手语数字人初始化响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignLanguageInitResponse {

    /**
     * 是否成功
     */
    private boolean success;

    /**
     * 初始化凭证类型。长期 AppSecret 不会返回给前端。
     */
    private String credentialType;

    /**
     * 错误信息
     */
    private String error;

    /**
     * 创建成功响应
     */
    public static SignLanguageInitResponse success(String credentialType) {
        return new SignLanguageInitResponse(true, credentialType, null);
    }

    /**
     * 创建失败响应
     */
    public static SignLanguageInitResponse error(String error) {
        return new SignLanguageInitResponse(false, null, error);
    }
}
