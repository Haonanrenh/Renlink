package com.renlink.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class XfyunSessionRequest {
    private String lang;
    private Integer roleType;
    private String pd;
}
