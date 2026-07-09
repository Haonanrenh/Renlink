package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class XfyunTtsSessionResponse {
    private boolean success;
    private String provider;
    private String wsUrl;
    private String appId;
    private String vcn;
    private String aue;
    private String auf;
    private String tte;
    private Integer speed;
    private Integer volume;
    private Integer pitch;
    private Integer sfl;
    private String message;
}
