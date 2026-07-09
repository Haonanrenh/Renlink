package com.renlink.service;

import com.renlink.dto.XfyunTtsSessionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@Service
public class XfyunTtsService {

    @Value("${xfyun.tts.enabled:false}")
    private boolean enabled;

    @Value("${xfyun.tts.app-id:}")
    private String appId;

    @Value("${xfyun.tts.api-key:}")
    private String apiKey;

    @Value("${xfyun.tts.api-secret:}")
    private String apiSecret;

    @Value("${xfyun.tts.base-url:wss://tts-api.xfyun.cn/v2/tts}")
    private String baseUrl;

    @Value("${xfyun.tts.vcn:x4_xiaoyan}")
    private String defaultVcn;

    @Value("${xfyun.tts.aue:lame}")
    private String defaultAue;

    @Value("${xfyun.tts.auf:audio/L16;rate=16000}")
    private String defaultAuf;

    @Value("${xfyun.tts.tte:UTF8}")
    private String defaultTte;

    @Value("${xfyun.tts.speed:50}")
    private int defaultSpeed;

    @Value("${xfyun.tts.volume:50}")
    private int defaultVolume;

    @Value("${xfyun.tts.pitch:50}")
    private int defaultPitch;

    @Value("${xfyun.tts.sfl:1}")
    private int defaultSfl;

    public XfyunTtsSessionResponse createSignedSession(String username) {
        if (!enabled) {
            throw new IllegalStateException("讯飞在线语音合成未启用，请先在 application.yml 中开启 xfyun.tts.enabled");
        }

        if (!StringUtils.hasText(appId) || !StringUtils.hasText(apiKey) || !StringUtils.hasText(apiSecret)) {
            throw new IllegalStateException("讯飞在线语音合成密钥未配置，请填写 xfyun.tts.app-id / api-key / api-secret");
        }

        return new XfyunTtsSessionResponse(
            true,
            "xfyun-online-tts",
            buildSignedUrl(),
            appId,
            defaultVcn,
            defaultAue,
            defaultAuf,
            defaultTte,
            defaultSpeed,
            defaultVolume,
            defaultPitch,
            defaultSfl,
            StringUtils.hasText(username)
                ? "讯飞在线语音合成连接已生成"
                : "讯飞在线语音合成连接已生成"
        );
    }

    private String buildSignedUrl() {
        try {
            URI uri = URI.create(baseUrl);
            String host = uri.getHost();
            String path = StringUtils.hasText(uri.getRawPath()) ? uri.getRawPath() : "/v2/tts";
            String date = buildRfc1123Date();

            String signatureOrigin = "host: " + host + "\n"
                + "date: " + date + "\n"
                + "GET " + path + " HTTP/1.1";

            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(apiSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            String signature = Base64.getEncoder().encodeToString(
                mac.doFinal(signatureOrigin.getBytes(StandardCharsets.UTF_8))
            );

            String authorizationOrigin = String.format(
                "api_key=\"%s\", algorithm=\"hmac-sha256\", headers=\"host date request-line\", signature=\"%s\"",
                apiKey,
                signature
            );
            String authorization = Base64.getEncoder().encodeToString(
                authorizationOrigin.getBytes(StandardCharsets.UTF_8)
            );

            String query = "authorization=" + URLEncoder.encode(authorization, StandardCharsets.UTF_8)
                + "&date=" + URLEncoder.encode(date, StandardCharsets.UTF_8)
                + "&host=" + URLEncoder.encode(host, StandardCharsets.UTF_8);

            return baseUrl + (baseUrl.contains("?") ? "&" : "?") + query;
        } catch (Exception e) {
            throw new IllegalStateException("生成讯飞在线语音合成签名失败: " + e.getMessage(), e);
        }
    }

    private String buildRfc1123Date() {
        SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
        return sdf.format(new Date());
    }
}
