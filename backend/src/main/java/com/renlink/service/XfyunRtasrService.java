package com.renlink.service;

import com.renlink.dto.XfyunSessionRequest;
import com.renlink.dto.XfyunSessionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;
import java.util.UUID;

@Service
public class XfyunRtasrService {

    private static final int FRAME_BYTES = 1280;
    private static final int FRAME_INTERVAL_MS = 40;

    @Value("${xfyun.rtasr-llm.enabled:false}")
    private boolean enabled;

    @Value("${xfyun.rtasr-llm.app-id:}")
    private String appId;

    @Value("${xfyun.rtasr-llm.access-key-id:}")
    private String accessKeyId;

    @Value("${xfyun.rtasr-llm.access-key-secret:}")
    private String accessKeySecret;

    @Value("${xfyun.rtasr-llm.base-url:wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1}")
    private String baseUrl;

    @Value("${xfyun.rtasr-llm.audio-encode:pcm_s16le}")
    private String audioEncode;

    @Value("${xfyun.rtasr-llm.lang:autodialect}")
    private String defaultLang;

    @Value("${xfyun.rtasr-llm.samplerate:16000}")
    private int sampleRate;

    @Value("${xfyun.rtasr-llm.role-type:0}")
    private int defaultRoleType;

    @Value("${xfyun.rtasr-llm.pd:}")
    private String defaultPd;

    public XfyunSessionResponse createSignedSession(XfyunSessionRequest request, String businessUserId) {
        if (!enabled) {
            throw new IllegalStateException("\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u672a\u542f\u7528\uff0c\u8bf7\u5148\u5728 application.yml \u4e2d\u5f00\u542f xfyun.rtasr-llm.enabled");
        }

        if (!StringUtils.hasText(appId) || !StringUtils.hasText(accessKeyId) || !StringUtils.hasText(accessKeySecret)) {
            throw new IllegalStateException("\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u5bc6\u94a5\u672a\u914d\u7f6e\uff0c\u8bf7\u586b\u5199 xfyun.rtasr-llm.app-id / access-key-id / access-key-secret");
        }

        String lang = StringUtils.hasText(request.getLang()) ? request.getLang() : defaultLang;
        int roleType = request.getRoleType() != null ? request.getRoleType() : defaultRoleType;
        String pd = StringUtils.hasText(request.getPd()) ? request.getPd() : defaultPd;

        Map<String, String> params = new TreeMap<>();
        params.put("accessKeyId", accessKeyId);
        params.put("appId", appId);
        params.put("audio_encode", audioEncode);
        params.put("lang", lang);
        params.put("samplerate", String.valueOf(sampleRate));
        params.put("uuid", buildUuid(businessUserId));
        params.put("utc", getUtcTime());

        if (roleType > 0) {
            params.put("role_type", String.valueOf(roleType));
        }
        if (StringUtils.hasText(pd)) {
            params.put("pd", pd);
        }

        params.put("signature", calculateSignature(params));

        return new XfyunSessionResponse(
            true,
            "xfyun-rtasr-llm",
            baseUrl + "?" + buildParamsString(params),
            lang,
            audioEncode,
            sampleRate,
            FRAME_BYTES,
            FRAME_INTERVAL_MS,
            "\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u8fde\u63a5\u5df2\u751f\u6210"
        );
    }

    private String buildUuid(String businessUserId) {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        if (!StringUtils.hasText(businessUserId)) {
            return suffix;
        }

        String normalized = businessUserId.replaceAll("[^a-zA-Z0-9_-]", "");
        if (!StringUtils.hasText(normalized)) {
            return suffix;
        }

        return normalized + "-" + suffix;
    }

    private String getUtcTime() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ");
        sdf.setTimeZone(TimeZone.getTimeZone("GMT+8"));
        return sdf.format(new Date());
    }

    private String calculateSignature(Map<String, String> params) {
        try {
            StringBuilder baseString = new StringBuilder();
            boolean first = true;

            for (Map.Entry<String, String> entry : params.entrySet()) {
                if ("signature".equals(entry.getKey())) {
                    continue;
                }
                if (!StringUtils.hasText(entry.getValue())) {
                    continue;
                }

                if (!first) {
                    baseString.append("&");
                }
                baseString
                    .append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                    .append("=")
                    .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
                first = false;
            }

            Mac mac = Mac.getInstance("HmacSHA1");
            SecretKeySpec keySpec = new SecretKeySpec(accessKeySecret.getBytes(StandardCharsets.UTF_8), "HmacSHA1");
            mac.init(keySpec);
            byte[] signBytes = mac.doFinal(baseString.toString().getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signBytes);
        } catch (Exception e) {
            throw new IllegalStateException("\u751f\u6210\u8baf\u98de\u5b9e\u65f6\u8f6c\u5199\u7b7e\u540d\u5931\u8d25: " + e.getMessage(), e);
        }
    }

    private String buildParamsString(Map<String, String> params) {
        StringBuilder builder = new StringBuilder();
        boolean first = true;

        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (!first) {
                builder.append("&");
            }
            builder
                .append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                .append("=")
                .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
            first = false;
        }

        return builder.toString();
    }
}
